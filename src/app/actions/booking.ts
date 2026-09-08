"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminClient, supabaseConfigured } from "@/lib/supabase";
import { getAvailability } from "@/lib/data";
import { site } from "@/lib/config";
import { sendClientConfirmation, sendArtistNotification } from "@/lib/email";

export type BookingState = {
  ok: boolean;
  error?: string;
  /** Set when the slot went while they were filling the form, so the UI can
   *  send them back to the picker rather than showing a dead end. */
  slotTaken?: boolean;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createBooking(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  if (!supabaseConfigured()) {
    return { ok: false, error: "Bookings aren't switched on yet. Please get in touch directly." };
  }

  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();
  const placement = String(formData.get("placement") ?? "").trim();
  const sizeEstimate = String(formData.get("sizeEstimate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!clientName) return { ok: false, error: "Please add your name." };
  if (!EMAIL_PATTERN.test(clientEmail)) {
    return { ok: false, error: "That email address doesn't look right." };
  }
  if (!startsAt) return { ok: false, error: "Please choose a time." };

  // Re-derive availability on the server and only accept a slot the picker
  // would actually have offered. Without this, a hand-crafted POST could book
  // 3am on a Sunday, or a time inside the minimum-notice window.
  const availability = await getAvailability();
  const slot = availability
    .flatMap((day) => day.slots)
    .find((candidate) => candidate.startsAt === startsAt);

  if (!slot) {
    return {
      ok: false,
      slotTaken: true,
      error: "That time has just been taken or is no longer available. Please pick another.",
    };
  }

  const files = formData
    .getAll("references")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > site.uploads.maxFiles) {
    return { ok: false, error: `Please attach at most ${site.uploads.maxFiles} images.` };
  }
  for (const file of files) {
    if (file.size > site.uploads.maxBytesPerFile) {
      return { ok: false, error: `"${file.name}" is over 10MB. Please attach a smaller version.` };
    }
    if (!site.uploads.acceptedMimeTypes.includes(file.type as never)) {
      return { ok: false, error: `"${file.name}" isn't an image we can read. Use JPG, PNG or WEBP.` };
    }
  }

  const supabase = adminClient();

  // The insert is the lock. `bookings_one_confirmed_per_slot` is a partial
  // unique index, so if two people submit the same slot at the same moment,
  // exactly one insert succeeds and the other comes back as 23505. Checking
  // first and inserting after would leave a window between the two where both
  // requests believe the slot is free.
  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone || null,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      placement: placement || null,
      size_estimate: sizeEstimate || null,
      notes: notes || null,
    })
    .select("id, reference, cancel_token, starts_at, ends_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        slotTaken: true,
        error: "Someone booked that slot a moment before you. Please choose another time.",
      };
    }
    return { ok: false, error: "Something went wrong saving your booking. Please try again." };
  }

  // Images are secondary: the appointment is already real, so a failed upload
  // is reported to the artist rather than thrown back at the client.
  let uploaded = 0;
  for (const [index, file] of files.entries()) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const storagePath = `${booking.id}/${index + 1}.${extension}`;

    const upload = await supabase.storage
      .from("references")
      .upload(storagePath, file, { contentType: file.type, upsert: true });

    if (!upload.error) {
      await supabase.from("booking_images").insert({
        booking_id: booking.id,
        storage_path: storagePath,
      });
      uploaded += 1;
    }
  }

  const emailPayload = {
    reference: booking.reference as string,
    cancelToken: booking.cancel_token as string,
    clientName,
    clientEmail,
    clientPhone: clientPhone || null,
    startsAt: booking.starts_at as string,
    endsAt: booking.ends_at as string,
    placement: placement || null,
    sizeEstimate: sizeEstimate || null,
    notes: notes || null,
    imageCount: uploaded,
  };

  await Promise.allSettled([
    sendClientConfirmation(emailPayload),
    sendArtistNotification(emailPayload),
  ]);

  revalidatePath("/book");
  revalidatePath("/admin");

  redirect(`/booking/${booking.reference}?t=${booking.cancel_token}`);
}

/** Client-side cancellation. Requires both the reference and the token. */
export async function cancelBooking(
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const reference = String(formData.get("reference") ?? "").trim().toUpperCase();
  const token = String(formData.get("token") ?? "").trim();

  if (!reference || !token) return { ok: false, error: "Missing booking details." };
  if (!supabaseConfigured()) return { ok: false, error: "Not available right now." };

  const supabase = adminClient();

  // Matching on both columns means a guessed reference is not enough — the
  // update simply affects no rows without the right token.
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "client",
    })
    .eq("reference", reference)
    .eq("cancel_token", token)
    .eq("status", "confirmed")
    .select("reference, client_name, client_email, starts_at, ends_at")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "We couldn't cancel that booking. It may already have been cancelled." };
  }

  const { sendCancellationNotice } = await import("@/lib/email");
  await sendCancellationNotice({
    reference: data.reference as string,
    clientName: data.client_name as string,
    clientEmail: data.client_email as string,
    startsAt: data.starts_at as string,
    endsAt: data.ends_at as string,
    cancelledBy: "client",
  });

  revalidatePath("/book");
  revalidatePath("/admin");
  revalidatePath(`/booking/${reference}`);

  return { ok: true };
}
