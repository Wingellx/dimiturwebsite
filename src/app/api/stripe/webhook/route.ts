import { handleCheckoutCompleted, handleCheckoutExpired } from "@/lib/deposits";
import { stripe } from "@/lib/stripe";

/**
 * Stripe → site. The signature check uses the raw body, so the request is
 * read as text and never parsed before verification.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Not configured", { status: 400 });

  const body = await request.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await handleCheckoutCompleted(event.data.object);
    } else if (event.type === "checkout.session.expired") {
      await handleCheckoutExpired(event.data.object);
    }
  } catch (error) {
    // A 500 makes Stripe retry, which is what we want for a transient
    // database or network failure. Handlers are idempotent.
    console.error("Stripe webhook failed", event.type, error);
    return new Response("Handler failed", { status: 500 });
  }

  return new Response("ok");
}
