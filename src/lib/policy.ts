import { site } from "./config";

/**
 * The deposit rules in one place, pure so they can be tested and shared by the
 * client booking page, the client actions, and the admin actions.
 */

export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed" | "expired";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** True once the appointment is less than 72 hours away. */
export function withinCutoff(startsAt: string, now: Date): boolean {
  return now.getTime() > new Date(startsAt).getTime() - site.changeCutoffHours * HOUR;
}

/**
 * Whether the client may cancel (with refund) or move the booking themselves.
 * Inside 72 hours they must message Dim; a refund lock (set when Dim moved it
 * inside the window) removes self-service for good.
 */
export function clientCanChange(startsAt: string, now: Date, refundLocked: boolean): boolean {
  return !refundLocked && !withinCutoff(startsAt, now);
}

/** When an unpaid slot hold lapses. */
export function holdExpiresAt(now: Date): Date {
  return new Date(now.getTime() + site.paymentHoldMinutes * MINUTE);
}

export function holdIsStale(pendingExpiresAt: string, now: Date): boolean {
  return now.getTime() >= new Date(pendingExpiresAt).getTime();
}

/**
 * What a "payment completed" webhook should do, by the booking's current
 * status. Anything already settled is ignored, which is what makes a
 * duplicate webhook delivery harmless.
 */
export function paidOutcome(
  status: BookingStatus,
  { refunded = false }: { refunded?: boolean } = {},
): "confirm" | "try_reclaim" | "ignore" {
  if (status === "pending_payment") return "confirm";
  // A late payment that was already refunded must never be confirmed or
  // refunded again when Stripe redelivers the event.
  if (status === "expired" && !refunded) return "try_reclaim";
  return "ignore";
}

/**
 * Stripe requires a Checkout session to live at least 30 minutes from when
 * Stripe creates it, so the request carries a minute of margin. The slot hold
 * runs to the same instant: it must never lapse while Stripe still takes money.
 */
export function checkoutTimes(now: Date): { stripeExpiresAt: Date; holdUntil: Date } {
  const stripeExpiresAt = new Date(now.getTime() + (site.paymentHoldMinutes + 1) * MINUTE);
  return { stripeExpiresAt, holdUntil: stripeExpiresAt };
}

export type DepositState = "none" | "paid" | "refunded" | "refund_needed";

/** What the admin card says about the money, including a refund that failed. */
export function depositState(booking: {
  deposit_paid_at: string | null;
  refunded_at: string | null;
  status: BookingStatus;
}): DepositState {
  if (!booking.deposit_paid_at) return "none";
  if (booking.refunded_at) return "refunded";
  return booking.status === "cancelled" ? "refund_needed" : "paid";
}

export type RefundReason = "client" | "artist" | "late_payment";

/**
 * How much of the deposit goes back. A client who cancels covers Stripe's
 * processing fee (Stripe keeps it on a refund, so otherwise Dim pays it);
 * Dim cancelling, or a late payment on a slot that had gone, refunds in full.
 * `feePence` is the real fee Stripe charged on that payment; when it can't be
 * read, the standard UK card rate (1.5% + 20p) stands in.
 */
export function refundAmount(depositPence: number, feePence: number | null, reason: RefundReason): number {
  if (reason !== "client") return depositPence;
  const fee = feePence ?? Math.round(depositPence * 0.015) + 20;
  return Math.max(0, depositPence - fee);
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
