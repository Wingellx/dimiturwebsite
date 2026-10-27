import "server-only";

import Stripe from "stripe";

import { site, siteUrl, TERMS_SENTENCE } from "./config";
import { studioDateLabel, studioTimeLabel } from "./availability";
import { refundAmount, type RefundReason } from "./policy";

/**
 * Deposits go through Stripe's hosted Checkout page, so card details never
 * touch this server. `payment_method_types` is deliberately left unset: that
 * is what lets Stripe offer Apple Pay and Google Pay on devices that have them.
 */

let client: Stripe | null = null;

/** Created lazily so a build without the key does not crash. */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  client ??= new Stripe(key);
  return client;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export async function createDepositCheckout(input: {
  bookingId: string;
  reference: string;
  cancelToken: string;
  clientEmail: string;
  startsAt: string;
  endsAt: string;
  sessionLabel: string;
  expiresAt: Date;
}): Promise<{ id: string; url: string }> {
  const manage = `${siteUrl()}/booking/${input.reference}?t=${input.cancelToken}`;
  const when = `${studioDateLabel(input.startsAt)}, ${studioTimeLabel(input.startsAt)}–${studioTimeLabel(input.endsAt)}`;

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: input.clientEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: site.deposit.currency,
          unit_amount: site.deposit.amountPence,
          product_data: {
            name: `Deposit – ${input.sessionLabel.toLowerCase()} tattoo appointment`,
            description: `${when}. Taken off your final price.`,
          },
        },
      },
    ],
    expires_at: Math.floor(input.expiresAt.getTime() / 1000),
    metadata: { booking_id: input.bookingId, reference: input.reference },
    payment_intent_data: {
      metadata: { booking_id: input.bookingId, reference: input.reference },
      description: `${site.artist} deposit ${input.reference}`,
    },
    custom_text: { submit: { message: TERMS_SENTENCE } },
    success_url: manage,
    cancel_url: manage,
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return { id: session.id, url: session.url };
}

/** The processing fee Stripe actually charged on a payment, in pence, or null if unreadable. */
async function stripeFeePence(paymentIntentId: string): Promise<number | null> {
  try {
    const intent = await stripe().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = intent.latest_charge;
    if (!charge || typeof charge === "string") return null;
    const txn = charge.balance_transaction;
    if (!txn || typeof txn === "string") return null;
    return txn.fee;
  } catch {
    return null;
  }
}

/**
 * Refunds the deposit — minus Stripe's fee when the client cancelled, in full
 * otherwise. Returns the refund id and the amount refunded. The idempotency
 * key means a retried request can never refund twice.
 */
export async function refundDeposit(
  bookingId: string,
  paymentIntentId: string,
  reason: RefundReason,
): Promise<{ id: string; amountPence: number }> {
  const fee = reason === "client" ? await stripeFeePence(paymentIntentId) : null;
  const amount = refundAmount(site.deposit.amountPence, fee, reason);
  const refund = await stripe().refunds.create(
    { payment_intent: paymentIntentId, amount },
    { idempotencyKey: `refund-${bookingId}` },
  );
  return { id: refund.id, amountPence: refund.amount };
}

/** True if the session is now unable to take payment (expired or already was). */
export async function expireCheckout(sessionId: string): Promise<boolean> {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (session.status === "complete") return false;
    if (session.status === "open") await stripe().checkout.sessions.expire(sessionId);
    return true;
  } catch (error) {
    console.error("Could not expire checkout", sessionId, error);
    return false;
  }
}

/** The payment page to send a client back to, if their session is still open. */
export async function openCheckoutUrl(sessionId: string): Promise<string | null> {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    return session.status === "open" ? session.url : null;
  } catch {
    return null;
  }
}
