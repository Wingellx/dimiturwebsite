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
export function paidOutcome(status: BookingStatus): "confirm" | "try_reclaim" | "ignore" {
  if (status === "pending_payment") return "confirm";
  if (status === "expired") return "try_reclaim";
  return "ignore";
}
