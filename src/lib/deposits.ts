import "server-only";

import type Stripe from "stripe";

import { adminClient } from "./supabase";
import { requireBookingById, type Booking } from "./data";
import { paidOutcome } from "./policy";
import { refundDeposit } from "./stripe";
import { sendArtistNotification, sendClientConfirmation, sendLatePaymentRefund } from "./email";

/**
 * Stripe webhook handlers. Only these confirm a booking: the success redirect
 * can be skipped (closed tab), and Stripe retries webhooks, so every write
 * below is conditional on the row's current status — a duplicate delivery
 * finds nothing to change and sends nothing.
 */

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

async function confirmFrom(
  booking: Booking,
  fromStatus: "pending_payment" | "expired",
  intentId: string | null,
): Promise<{ confirmed: boolean; overlap: boolean }> {
  const { data, error } = await adminClient()
    .from("bookings")
    .update({
      status: "confirmed",
      deposit_paid_at: new Date().toISOString(),
      stripe_payment_intent_id: intentId,
      pending_expires_at: null,
    })
    .eq("id", booking.id)
    .eq("status", fromStatus)
    .select("id")
    .maybeSingle();

  if (error?.code === "23P01") return { confirmed: false, overlap: true };
  // Anything else is unexpected: throw so the webhook answers 500 and Stripe
  // retries, instead of acknowledging and losing a paid booking.
  if (error) throw error;
  return { confirmed: Boolean(data), overlap: false };
}

async function sendConfirmationEmails(booking: Booking): Promise<void> {
  const { count } = await adminClient()
    .from("booking_images")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id);

  const payload = {
    reference: booking.reference,
    cancelToken: booking.cancel_token,
    clientName: booking.client_name,
    clientEmail: booking.client_email,
    clientPhone: booking.client_phone,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    session: booking.session_type,
    placement: booking.placement,
    sizeEstimate: booking.size_estimate,
    notes: booking.notes,
    imageCount: count ?? 0,
  };
  await Promise.allSettled([sendClientConfirmation(payload), sendArtistNotification(payload)]);
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId || session.payment_status !== "paid") return;

  const booking = await requireBookingById(bookingId);
  if (!booking) return;
  const intentId = paymentIntentId(session);

  switch (paidOutcome(booking.status, { refunded: Boolean(booking.stripe_refund_id) })) {
    case "confirm": {
      const result = await confirmFrom(booking, "pending_payment", intentId);
      if (result.confirmed) await sendConfirmationEmails(booking);
      return;
    }
    case "try_reclaim": {
      // Paid after the hold lapsed. Keep the booking if the slot is still
      // free; if someone else has it, give the money straight back.
      const released = await adminClient().rpc("release_stale_holds", {
        range_start: booking.starts_at,
        range_end: booking.ends_at,
      });
      if (released.error) throw released.error;
      const result = await confirmFrom(booking, "expired", intentId);
      if (result.confirmed) {
        await sendConfirmationEmails(booking);
        return;
      }
      if (result.overlap && intentId) {
        const { id: refundId } = await refundDeposit(booking.id, intentId, "late_payment");
        const saved = await adminClient()
          .from("bookings")
          .update({
            stripe_payment_intent_id: intentId,
            stripe_refund_id: refundId,
            refunded_at: new Date().toISOString(),
          })
          .eq("id", booking.id);
        if (saved.error) throw saved.error;
        await sendLatePaymentRefund({
          clientName: booking.client_name,
          clientEmail: booking.client_email,
          startsAt: booking.starts_at,
          endsAt: booking.ends_at,
        });
      }
      return;
    }
    case "ignore":
      return;
  }
}

export async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return;
  const { error } = await adminClient()
    .from("bookings")
    .update({ status: "expired" })
    .eq("id", bookingId)
    .eq("status", "pending_payment");
  if (error) throw error;
}
