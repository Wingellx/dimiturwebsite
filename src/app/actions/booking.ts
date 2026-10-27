"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminClient, supabaseConfigured } from "@/lib/supabase";
import { getAvailability, getBookingByReference, type Booking } from "@/lib/data";
import { moveToSlot, refundIfPaid } from "@/lib/booking-changes";
import { sendCancellationNotice } from "@/lib/email";
import { cancellationAlert, consultationAlert, postToSlack } from "@/lib/slack";
import { studioInstant } from "@/lib/availability";
import { site } from "@/lib/config";
import { checkoutTimes, clientCanChange } from "@/lib/policy";
import { createDepositCheckout, expireCheckout, stripeConfigured } from "@/lib/stripe";

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
  if (!supabaseConfigured() || !stripeConfigured()) {
    return { ok: false, error: "Bookings aren't switched on yet. Please get in touch directly." };
  }

  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const session = String(formData.get("session") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();
  const placement = String(formData.get("placement") ?? "").trim();
  const sizeEstimate = String(formData.get("sizeEstimate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!clientName) return { ok: false, error: "Please add your name." };
  if (formData.get("acceptTerms") !== "yes") {
    return { ok: false, error: "Please agree to the deposit terms to continue." };
  }
  if (!EMAIL_PATTERN.test(clientEmail)) {
    return { ok: false, error: "That email address doesn't look right." };
  }
  if (!startsAt || !endsAt || (session !== "half" && session !== "full")) {
    return { ok: false, error: "Please choose a session and time." };
  }

  // Re-derive availability on the server and only accept a slot the picker
  // would actually have offered. Without this, a hand-crafted POST could book
  // a shift day, a full day over a booked morning, or a time inside the
  // minimum-notice window. A full day and a morning share a start time, so
  // the match is on all three fields.
  const availability = await getAvailability();
  const slot = availability
    .flatMap((day) => day.slots)
    .find(
      (candidate) =>
        candidate.startsAt === startsAt &&
        candidate.endsAt === endsAt &&
        candidate.session === session,
    );

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
  const now = new Date();

  // A hold whose 30 minutes are up still matches the overlap constraint until
  // something flips it to 'expired'. Do that for this slot first, so an
  // abandoned checkout never blocks the next client.
  await supabase.rpc("release_stale_holds", {
    range_start: slot.startsAt,
    range_end: slot.endsAt,
  });

  // The insert is the lock. `bookings_no_overlap` is an exclusion constraint
  // on the booking's time range, so if two people submit overlapping slots at
  // the same moment (two mornings, or a morning and a full day), exactly one
  // insert succeeds and the other comes back as 23P01. Checking first and
  // inserting after would leave a window where both believe the slot is free.
  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone || null,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      session_type: slot.session,
      status: "pending_payment",
      pending_expires_at: checkoutTimes(now).holdUntil.toISOString(),
      terms_accepted_at: now.toISOString(),
      placement: placement || null,
      size_estimate: sizeEstimate || null,
      notes: notes || null,
    })
    .select("id, reference, cancel_token, starts_at, ends_at")
    .single();

  if (error) {
    // 23P01 = exclusion violation; 23505 kept for databases still on the old
    // unique index.
    if (error.code === "23P01" || error.code === "23505") {
      return {
        ok: false,
        slotTaken: true,
        error: "Someone booked that slot a moment before you. Please choose another time.",
      };
    }
    return { ok: false, error: "Something went wrong saving your booking. Please try again." };
  }

  // Images are secondary: a failed upload is reported to the artist (via the
  // image count in their email) rather than thrown back at the client.
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
    }
  }

  // The slot is held, not booked. Confirmation (and both emails) happen only
  // when Stripe's webhook reports the deposit paid.
  let checkoutUrl: string;
  try {
    // Worked out after the uploads, right before the call: Stripe measures its
    // 30-minute minimum from when it creates the session.
    const times = checkoutTimes(new Date());
    const checkout = await createDepositCheckout({
      bookingId: booking.id as string,
      reference: booking.reference as string,
      cancelToken: booking.cancel_token as string,
      clientEmail,
      startsAt: booking.starts_at as string,
      endsAt: booking.ends_at as string,
      sessionLabel: site.sessions[slot.session].label,
      expiresAt: times.stripeExpiresAt,
    });
    await supabase
      .from("bookings")
      .update({
        stripe_checkout_session_id: checkout.id,
        pending_expires_at: times.holdUntil.toISOString(),
      })
      .eq("id", booking.id);
    checkoutUrl = checkout.url;
  } catch (stripeError) {
    console.error("Stripe checkout failed", stripeError);
    await supabase.from("bookings").update({ status: "expired" }).eq("id", booking.id);
    return { ok: false, error: "We couldn't start the payment. Please try again." };
  }

  revalidatePath("/book");
  redirect(checkoutUrl);
}

type ChangeState = { ok: boolean; error?: string; slotTaken?: boolean };

/** Loads a booking by reference + token. Both must match; a guessed reference is not enough. */
async function bookingForClient(reference: string, token: string): Promise<Booking | null> {
  if (!reference || !token) return null;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.cancel_token !== token) return null;
  return booking;
}

const TOO_LATE = `It's too close to your appointment to change it online. Please message ${site.artist.split(" ")[0]} directly.`;

/** Client-side cancellation: 72h+ out only, deposit refunded. */
export async function cancelBooking(_prev: ChangeState, formData: FormData): Promise<ChangeState> {
  const reference = String(formData.get("reference") ?? "").trim().toUpperCase();
  const token = String(formData.get("token") ?? "").trim();
  if (!supabaseConfigured()) return { ok: false, error: "Not available right now." };

  const booking = await bookingForClient(reference, token);
  if (!booking || booking.status !== "confirmed") {
    return { ok: false, error: "We couldn't cancel that booking. It may already have been cancelled." };
  }
  // Re-checked here, not just hidden in the page: a page loaded at 72h01m and
  // submitted at 71h59m must still be refused.
  if (!clientCanChange(booking.starts_at, new Date(), booking.refund_locked)) {
    return { ok: false, error: TOO_LATE };
  }

  const supabase = adminClient();
  const { data } = await supabase
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "client" })
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  if (!data) return { ok: false, error: "We couldn't cancel that booking. It may already have been cancelled." };

  if (booking.consultation_block_id) {
    await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "client" })
      .eq("id", booking.consultation_block_id)
      .eq("status", "confirmed");
  }

  const refunded = await refundIfPaid(booking, "client");

  await sendCancellationNotice({
    reference: booking.reference,
    clientName: booking.client_name,
    clientEmail: booking.client_email,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    cancelledBy: "client",
    refunded,
  });
  await postToSlack(
    cancellationAlert({
      clientName: booking.client_name,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      cancelledBy: "client",
      refund: refunded.status,
    }),
  );

  revalidatePath("/book");
  revalidatePath("/admin");
  revalidatePath(`/booking/${reference}`);
  return { ok: true };
}

/** Client-side move: 72h+ out only, reason required, deposit carries over. */
export async function moveBooking(_prev: ChangeState, formData: FormData): Promise<ChangeState> {
  const reference = String(formData.get("reference") ?? "").trim().toUpperCase();
  const token = String(formData.get("token") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!supabaseConfigured()) return { ok: false, error: "Not available right now." };

  const booking = await bookingForClient(reference, token);
  if (!booking || booking.status !== "confirmed") {
    return { ok: false, error: "We couldn't find that booking." };
  }
  if (!clientCanChange(booking.starts_at, new Date(), booking.refund_locked)) {
    return { ok: false, error: TOO_LATE };
  }
  if (!reason) return { ok: false, error: `Please tell ${site.artist.split(" ")[0]} why you're moving it.` };

  const result = await moveToSlot(booking, { startsAt, endsAt }, reason, "client");
  if (!result.ok) return result;

  revalidatePath("/book");
  revalidatePath("/admin");
  revalidatePath(`/booking/${reference}`);
  return { ok: true };
}

/**
 * The client backed out of Stripe and wants a different time. Ends the
 * Checkout session first so it can no longer take money, then frees the slot.
 */
export async function releaseHold(formData: FormData): Promise<void> {
  const reference = String(formData.get("reference") ?? "").trim().toUpperCase();
  const token = String(formData.get("token") ?? "").trim();
  const booking = await bookingForClient(reference, token);

  if (booking?.status === "pending_payment") {
    let ended = true;
    if (booking.stripe_checkout_session_id) {
      ended = await expireCheckout(booking.stripe_checkout_session_id);
    }
    // If Stripe would not expire it, it was completed: leave the row for the
    // webhook to confirm rather than releasing a paid slot.
    if (ended) {
      await adminClient()
        .from("bookings")
        .update({ status: "expired" })
        .eq("id", booking.id)
        .eq("status", "pending_payment");
      revalidatePath("/book");
    }
  }
  redirect("/book");
}

export type ConsultationState = { ok: boolean; error?: string };

/**
 * The client adds, changes or removes the optional design consultation from
 * their booking page. Nothing is charged here: it's paid on the tattoo day.
 */
export async function setConsultation(_prev: ConsultationState, formData: FormData): Promise<ConsultationState> {
  const reference = String(formData.get("reference") ?? "").trim().toUpperCase();
  const token = String(formData.get("token") ?? "").trim();
  const option = String(formData.get("option") ?? "");
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "").slice(0, 5);

  const booking = await bookingForClient(reference, token);
  if (!booking || booking.status !== "confirmed" || booking.session_type === "consultation") {
    return { ok: false, error: "We couldn't find that booking." };
  }
  if (new Date(booking.starts_at).getTime() <= Date.now()) {
    return { ok: false, error: "This appointment has already started." };
  }

  const supabase = adminClient();
  // Any previously approved separate-day slot is freed when the choice changes.
  if (booking.consultation_block_id) {
    await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "client" })
      .eq("id", booking.consultation_block_id)
      .eq("status", "confirmed");
  }

  let update: Record<string, unknown>;
  if (option === "none") {
    update = { consultation_option: null, consultation_status: null, consultation_requested_start: null, consultation_block_id: null };
  } else if (option === "same_day") {
    update = { consultation_option: "same_day", consultation_status: "confirmed", consultation_requested_start: null, consultation_block_id: null };
  } else if (option === "separate") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return { ok: false, error: "Pick a date and time you'd like." };
    }
    const requested = studioInstant(date, { hours: Number(time.slice(0, 2)), minutes: Number(time.slice(3)) });
    if (requested.getTime() <= Date.now()) return { ok: false, error: "That time has already passed." };
    if (requested.getTime() >= new Date(booking.starts_at).getTime()) {
      return { ok: false, error: "Pick a time before your tattoo appointment." };
    }
    update = {
      consultation_option: "separate",
      consultation_status: "requested",
      consultation_requested_start: requested.toISOString(),
      consultation_block_id: null,
    };
  } else {
    return { ok: false, error: "Choose an option." };
  }

  const { error } = await supabase.from("bookings").update(update).eq("id", booking.id);
  if (error) return { ok: false, error: "Couldn't save that. Please try again." };

  await postToSlack(
    consultationAlert({
      clientName: booking.client_name,
      tattooStartsAt: booking.starts_at,
      tattooEndsAt: booking.ends_at,
      option: (update.consultation_option as "same_day" | "separate" | null) ?? null,
      requestedStart: (update.consultation_requested_start as string | null) ?? null,
    }),
  );

  revalidatePath(`/booking/${reference}`);
  revalidatePath("/admin");
  revalidatePath("/book");
  return { ok: true };
}
