"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  passwordMatches,
  startSession,
  endSession,
  isAuthenticated,
} from "@/lib/admin-auth";
import { adminClient } from "@/lib/supabase";
import { sendCancellationNotice, sendDepositRequest } from "@/lib/email";
import { cancellationAlert, postToSlack } from "@/lib/slack";
import { getBookingById, getRota } from "@/lib/data";
import { moveToSlot, refundIfPaid } from "@/lib/booking-changes";
import { manualCheckoutTimes, withinCutoff } from "@/lib/policy";
import { studioInstant } from "@/lib/availability";
import { createDepositCheckout } from "@/lib/stripe";
import { announceConfirmed } from "@/lib/deposits";
import { planForDate, type DayOverride } from "@/lib/availability";

/** Every mutation below goes through this first. */
async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error("Not authorised.");
  }
}

export async function login(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter your password." };

  // A deliberate small delay blunts online guessing without needing a rate
  // limiter for a single-user login.
  await new Promise((resolve) => setTimeout(resolve, 400));

  try {
    if (!passwordMatches(password)) return { error: "That password isn't right." };
  } catch (error) {
    return { error: String((error as Error).message) };
  }

  await startSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

/** Dim cancelling always refunds the deposit, even a refund-locked one. */
export async function artistCancelBooking(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  if (!id) return;
  const booking = await getBookingById(id);
  if (!booking || booking.status !== "confirmed") return;

  const { data } = await adminClient()
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "artist",
      cancellation_note: note,
    })
    .eq("id", id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();

  if (data) {
    const refunded = await refundIfPaid(booking, "artist");
    await sendCancellationNotice({
      reference: booking.reference,
      clientName: booking.client_name,
      clientEmail: booking.client_email,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      cancelledBy: "artist",
      refunded,
      note,
    });
    await postToSlack(
      cancellationAlert({
        clientName: booking.client_name,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        cancelledBy: "artist",
        refund: refunded.status,
      }),
    );
  }

  revalidatePath("/admin");
  revalidatePath("/book");
}

/**
 * Dim can move any confirmed booking at any time — this is how under-72-hour
 * requests get handled. Moving one that is already inside the window locks
 * the deposit as non-refundable, so "move it, then cancel" can't turn a late
 * cancellation into a refund.
 */
export async function artistMoveBooking(
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const booking = await getBookingById(id);
  if (!booking || booking.status !== "confirmed") return { ok: false, error: "Booking not found." };

  const lock = withinCutoff(booking.starts_at, new Date());
  const result = await moveToSlot(booking, { startsAt, endsAt }, reason, "artist", lock ? { refund_locked: true } : {});
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin");
  revalidatePath("/book");
  revalidatePath(`/booking/${booking.reference}`);
  return { ok: true };
}

export async function markCompleted(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await adminClient()
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", id);

  revalidatePath("/admin");
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function revalidateAvailability(): void {
  revalidatePath("/admin");
  revalidatePath("/book");
}

/**
 * Opens or closes one date, optionally with custom hours. When the result is
 * exactly what the rota would give anyway, the override is deleted instead,
 * so "reset" and "toggle back" leave no stale rows behind.
 */
export async function setDay(formData: FormData): Promise<void> {
  await requireAdmin();

  const date = String(formData.get("date") ?? "");
  const open = formData.get("open") === "true";
  const startTime = String(formData.get("startTime") ?? "").slice(0, 5);
  const endTime = String(formData.get("endTime") ?? "").slice(0, 5);
  if (!DATE_PATTERN.test(date)) return;

  const custom = open && TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime);
  if (custom && endTime <= startTime) return;

  const rota = await getRota();
  if (!rota) return;

  const override: DayOverride = {
    date,
    open,
    start_time: custom ? startTime : null,
    end_time: custom ? endTime : null,
  };
  const withOverride = planForDate(date, rota, [override]);
  const fromRota = planForDate(date, rota, []);
  const sameAsRota =
    withOverride.open === fromRota.open &&
    withOverride.halves === fromRota.halves &&
    withOverride.window?.start === fromRota.window?.start &&
    withOverride.window?.end === fromRota.window?.end;

  const table = adminClient().from("day_overrides");
  if (sameAsRota) {
    await table.delete().eq("date", date);
  } else {
    await table.upsert(override, { onConflict: "date" });
  }

  revalidateAvailability();
}

export async function resetDay(formData: FormData): Promise<void> {
  await requireAdmin();

  const date = String(formData.get("date") ?? "");
  if (!DATE_PATTERN.test(date)) return;

  await adminClient().from("day_overrides").delete().eq("date", date);
  revalidateAvailability();
}

export async function saveRota(formData: FormData): Promise<void> {
  await requireAdmin();

  const pattern = String(formData.get("pattern") ?? "").toUpperCase();
  const anchorDate = String(formData.get("anchorDate") ?? "");
  const dayStart = String(formData.get("dayStart") ?? "").slice(0, 5);
  const dayEnd = String(formData.get("dayEnd") ?? "").slice(0, 5);

  if (!/^[WO]{2,28}$/.test(pattern)) return;
  if (!DATE_PATTERN.test(anchorDate)) return;
  if (!TIME_PATTERN.test(dayStart) || !TIME_PATTERN.test(dayEnd) || dayEnd <= dayStart) return;

  await adminClient()
    .from("rota_settings")
    .upsert({
      id: 1,
      pattern,
      anchor_date: anchorDate,
      day_start: dayStart,
      day_end: dayEnd,
      updated_at: new Date().toISOString(),
    });

  revalidateAvailability();
}

export type ManualBookingState = { ok: boolean; error?: string; payUrl?: string; reference?: string };

/**
 * Dim adds a booking himself — anything that isn't a standard half or full
 * day, usually agreed over Instagram. It can sit outside the rota (his call)
 * but never on top of another booking: the overlap constraint still applies.
 */
export async function createManualBooking(
  _prev: ManualBookingState,
  formData: FormData,
): Promise<ManualBookingState> {
  await requireAdmin();

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "").slice(0, 5);
  const endTime = String(formData.get("endTime") ?? "").slice(0, 5);
  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim() || null;
  const placement = String(formData.get("placement") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const priceLabel = String(formData.get("priceLabel") ?? "").trim().slice(0, 40) || null;
  const deposit = formData.get("deposit") === "link";

  if (!DATE_PATTERN.test(date)) return { ok: false, error: "Pick a date." };
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || endTime <= startTime) {
    return { ok: false, error: "The end time needs to be after the start time." };
  }
  if (!clientName) return { ok: false, error: "Add the client's name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    return { ok: false, error: "Add the client's email, so they get their confirmation." };
  }

  const startsAt = studioInstant(date, { hours: Number(startTime.slice(0, 2)), minutes: Number(startTime.slice(3)) });
  const endsAt = studioInstant(date, { hours: Number(endTime.slice(0, 2)), minutes: Number(endTime.slice(3)) });
  if (startsAt.getTime() <= Date.now()) return { ok: false, error: "That time has already passed." };

  const supabase = adminClient();
  const now = new Date();
  const times = manualCheckoutTimes(now);
  await supabase.rpc("release_stale_holds", { range_start: startsAt.toISOString(), range_end: endsAt.toISOString() });

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      session_type: "custom",
      price_label: priceLabel,
      placement,
      notes,
      status: deposit ? "pending_payment" : "confirmed",
      pending_expires_at: deposit ? times.holdUntil.toISOString() : null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23P01") return { ok: false, error: "That overlaps another booking. Pick a different time." };
    return { ok: false, error: "Couldn't save that booking. Please try again." };
  }

  const saved = await getBookingById(booking.id as string);
  if (!saved) return { ok: false, error: "Saved, but couldn't reload it. Refresh the page." };

  if (!deposit) {
    await announceConfirmed(saved, { depositPaid: false });
    revalidatePath("/admin");
    revalidatePath("/book");
    return { ok: true, reference: saved.reference };
  }

  try {
    const checkout = await createDepositCheckout({
      bookingId: saved.id,
      reference: saved.reference,
      cancelToken: saved.cancel_token,
      clientEmail,
      startsAt: saved.starts_at,
      endsAt: saved.ends_at,
      sessionLabel: "Custom session",
      expiresAt: times.stripeExpiresAt,
    });
    await supabase.from("bookings").update({ stripe_checkout_session_id: checkout.id }).eq("id", saved.id);
    await sendDepositRequest({
      clientName,
      clientEmail,
      startsAt: saved.starts_at,
      endsAt: saved.ends_at,
      payUrl: checkout.url,
      priceLabel,
    });
    revalidatePath("/admin");
    revalidatePath("/book");
    return { ok: true, payUrl: checkout.url, reference: saved.reference };
  } catch (stripeError) {
    console.error("Manual deposit checkout failed", stripeError);
    await supabase.from("bookings").update({ status: "expired" }).eq("id", saved.id);
    return { ok: false, error: "Couldn't create the payment link. Please try again." };
  }
}
