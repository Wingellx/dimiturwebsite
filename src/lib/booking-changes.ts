import "server-only";

import { adminClient } from "./supabase";
import { getAvailability, type Booking } from "./data";
import { refundDeposit } from "./stripe";
import type { RefundReason } from "./policy";
import { sendMoveNotice } from "./email";
import { moveAlert, postToSlack } from "./slack";

/**
 * Shared by the client actions and Dim's admin actions, so both paths apply
 * the same slot checks, history and refund handling.
 */

export type RefundOutcome =
  | { status: "refunded"; amountPence: number }
  | { status: "failed" }
  | { status: "none" };

/**
 * Refunds the deposit if one was paid and not already refunded. A client
 * cancelling gets it back minus Stripe's fee; Dim cancelling refunds in full.
 */
export async function refundIfPaid(booking: Booking, reason: RefundReason): Promise<RefundOutcome> {
  if (!booking.deposit_paid_at || !booking.stripe_payment_intent_id) return { status: "none" };
  if (booking.stripe_refund_id) return { status: "none" };
  try {
    const refund = await refundDeposit(booking.id, booking.stripe_payment_intent_id, reason);
    await adminClient()
      .from("bookings")
      .update({ stripe_refund_id: refund.id, refunded_at: new Date().toISOString() })
      .eq("id", booking.id);
    return { status: "refunded", amountPence: refund.amountPence };
  } catch (error) {
    console.error("Deposit refund failed", booking.reference, error);
    return { status: "failed" };
  }
}

/**
 * Moves a confirmed booking to a slot the picker would genuinely offer, of the
 * same session type. The update is the lock: the overlap constraint refuses it
 * if someone took the slot in the meantime.
 */
export async function moveToSlot(
  booking: Booking,
  target: { startsAt: string; endsAt: string },
  reason: string | null,
  movedBy: "client" | "artist",
  extra: { refund_locked?: boolean } = {},
): Promise<{ ok: boolean; error?: string; slotTaken?: boolean }> {
  const availability = await getAvailability();
  const slot = availability
    .flatMap((day) => day.slots)
    .find(
      (s) => s.startsAt === target.startsAt && s.endsAt === target.endsAt && s.session === booking.session_type,
    );
  if (!slot) {
    return { ok: false, slotTaken: true, error: "That time isn't available any more. Please choose another." };
  }

  const supabase = adminClient();
  await supabase.rpc("release_stale_holds", { range_start: slot.startsAt, range_end: slot.endsAt });

  const { data, error } = await supabase
    .from("bookings")
    .update({ starts_at: slot.startsAt, ends_at: slot.endsAt, ...extra })
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();

  if (error?.code === "23P01") {
    return { ok: false, slotTaken: true, error: "Someone booked that slot a moment ago. Please choose another." };
  }
  if (error || !data) return { ok: false, error: "We couldn't move that booking. Please try again." };

  await supabase.from("booking_moves").insert({
    booking_id: booking.id,
    old_starts_at: booking.starts_at,
    old_ends_at: booking.ends_at,
    new_starts_at: slot.startsAt,
    new_ends_at: slot.endsAt,
    reason,
    moved_by: movedBy,
  });

  await sendMoveNotice({
    reference: booking.reference,
    cancelToken: booking.cancel_token,
    clientName: booking.client_name,
    clientEmail: booking.client_email,
    oldStartsAt: booking.starts_at,
    oldEndsAt: booking.ends_at,
    newStartsAt: slot.startsAt,
    newEndsAt: slot.endsAt,
    reason,
    movedBy,
  });
  await postToSlack(
    moveAlert({
      clientName: booking.client_name,
      oldStartsAt: booking.starts_at,
      oldEndsAt: booking.ends_at,
      newStartsAt: slot.startsAt,
      newEndsAt: slot.endsAt,
      reason,
      movedBy,
    }),
  );

  return { ok: true };
}
