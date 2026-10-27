import "server-only";

import { Resend } from "resend";
import { site, emailFrom, siteUrl, sessionText, TERMS_SENTENCE, type BookingSession } from "./config";
import { studioDateLabel, studioTimeLabel } from "./availability";
import { formatPence } from "./policy";
import type { RefundOutcome } from "./booking-changes";

type BookingEmailInput = {
  reference: string;
  cancelToken: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string | null;
  startsAt: string;
  endsAt: string;
  session: BookingSession;
  priceLabel?: string | null;
  depositPaid: boolean;
  placement?: string | null;
  sizeEstimate?: string | null;
  notes?: string | null;
  imageCount: number;
};

/**
 * Email is best-effort. A confirmed booking is already safe in the database,
 * so a Resend outage must never turn into a failed booking — every function
 * here swallows its errors and reports them, and the caller carries on.
 */
function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function when(startsAt: string, endsAt: string): string {
  return `${studioDateLabel(startsAt)}, ${studioTimeLabel(startsAt)}–${studioTimeLabel(endsAt)}`;
}

const shell = (inner: string) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.6">
  ${inner}
  <p style="margin-top:40px;padding-top:24px;border-top:1px solid #e5e2dd;font-size:13px;color:#8a8580">
    ${site.artist}${site.studio.name ? ` · ${site.studio.name}` : ""}
  </p>
</div>`;

export async function sendClientConfirmation(
  booking: BookingEmailInput,
): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };

  const manageUrl = `${siteUrl()}/booking/${booking.reference}?t=${booking.cancelToken}`;

  try {
    await resend.emails.send({
      from: emailFrom,
      to: booking.clientEmail,
      subject: `Your tattoo appointment: ${when(booking.startsAt, booking.endsAt)}`,
      html: shell(`
        <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">You're booked in</h1>
        <p style="margin:0 0 20px">Hi ${escapeHtml(booking.clientName)}, your appointment with ${site.artist} is confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">When</td><td style="padding:8px 0;font-weight:600">${when(booking.startsAt, booking.endsAt)}</td></tr>
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Session</td><td style="padding:8px 0">${sessionText(booking.session, booking.priceLabel)}</td></tr>
          ${booking.depositPaid ? `<tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Deposit</td><td style="padding:8px 0">${site.deposit.label} paid, taken off your final price</td></tr>` : ""}
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Reference</td><td style="padding:8px 0;font-family:ui-monospace,monospace">${booking.reference}</td></tr>
          ${booking.placement ? `<tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Placement</td><td style="padding:8px 0">${escapeHtml(booking.placement)}</td></tr>` : ""}
          ${booking.sizeEstimate ? `<tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Size</td><td style="padding:8px 0">${escapeHtml(booking.sizeEstimate)}</td></tr>` : ""}
        </table>
        <p style="margin:0 0 20px"><a href="${siteUrl()}/before-your-tattoo" style="display:inline-block;background:#14110f;color:#faf8f5;padding:12px 20px;border-radius:4px;text-decoration:none">Before your tattoo: how to prepare</a></p>
        <p style="margin:0 0 24px;font-size:14px;color:#5a5550">Need to move or cancel? <a href="${manageUrl}" style="color:#1a1a1a">Manage your booking</a>. You can move it, or cancel for a refund of your deposit minus the card processing fee, up to ${site.changeCutoffHours} hours before. After that, please message ${site.artist.split(" ")[0]} directly.</p>
      `),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function sendArtistNotification(
  booking: BookingEmailInput,
): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  const to = process.env.ARTIST_NOTIFICATION_EMAIL;
  if (!resend || !to) return { ok: false, error: "notification email not configured" };

  try {
    await resend.emails.send({
      from: emailFrom,
      to,
      replyTo: booking.clientEmail,
      subject: `New booking: ${booking.clientName}, ${when(booking.startsAt, booking.endsAt)}`,
      html: shell(`
        <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">New booking</h1>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">When</td><td style="padding:8px 0;font-weight:600">${when(booking.startsAt, booking.endsAt)}</td></tr>
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Session</td><td style="padding:8px 0">${sessionText(booking.session, booking.priceLabel)}</td></tr>
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Name</td><td style="padding:8px 0">${escapeHtml(booking.clientName)}</td></tr>
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Email</td><td style="padding:8px 0">${escapeHtml(booking.clientEmail)}</td></tr>
          ${booking.clientPhone ? `<tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Phone</td><td style="padding:8px 0">${escapeHtml(booking.clientPhone)}</td></tr>` : ""}
          ${booking.placement ? `<tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Placement</td><td style="padding:8px 0">${escapeHtml(booking.placement)}</td></tr>` : ""}
          ${booking.sizeEstimate ? `<tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Size</td><td style="padding:8px 0">${escapeHtml(booking.sizeEstimate)}</td></tr>` : ""}
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">References</td><td style="padding:8px 0">${booking.imageCount} image${booking.imageCount === 1 ? "" : "s"}</td></tr>
        </table>
        ${booking.notes ? `<p style="margin:0 0 8px;color:#8a8580;font-size:14px">Notes</p><p style="margin:0 0 24px;white-space:pre-wrap">${escapeHtml(booking.notes)}</p>` : ""}
        <p style="margin:0"><a href="${siteUrl()}/admin" style="color:#1a1a1a">Open admin</a></p>
      `),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function sendCancellationNotice(input: {
  reference: string;
  clientName: string;
  clientEmail: string;
  startsAt: string;
  endsAt: string;
  cancelledBy: "client" | "artist";
  refunded: RefundOutcome;
  /** Dim's message to the client when he cancels. */
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };

  const recipients = [input.clientEmail];
  const artistEmail = process.env.ARTIST_NOTIFICATION_EMAIL;
  if (artistEmail) recipients.push(artistEmail);

  try {
    await resend.emails.send({
      from: emailFrom,
      to: recipients,
      subject: `Appointment cancelled: ${when(input.startsAt, input.endsAt)}`,
      html: shell(`
        <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">Appointment cancelled</h1>
        <p style="margin:0 0 20px">The appointment on <strong>${when(input.startsAt, input.endsAt)}</strong> (ref ${input.reference}) has been cancelled${input.cancelledBy === "artist" ? " by the studio" : ""}. That slot is now free for someone else.</p>
        ${input.note ? `<div style="margin:0 0 20px;padding:12px 14px;background:#f3efe9;border-radius:4px"><p style="margin:0 0 6px;font-size:13px;color:#8a8580">Message from ${site.artist.split(" ")[0]}</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(input.note)}</p></div>` : ""}
        ${input.refunded.status === "refunded" ? `<p style="margin:0 0 20px">${formatPence(input.refunded.amountPence)} has been refunded to your card${input.refunded.amountPence < site.deposit.amountPence ? ` (your ${site.deposit.label} deposit minus the ${formatPence(site.deposit.amountPence - input.refunded.amountPence)} card processing fee, which isn't refundable)` : ""}. It usually shows within 5–10 working days.</p>` : ""}
        ${input.refunded.status === "failed" ? `<p style="margin:0 0 20px">Your deposit refund is being processed and will reach your card shortly.</p>` : ""}
        <p style="margin:0"><a href="${siteUrl()}/book" style="color:#1a1a1a">Book another time</a></p>
      `),
    });
    if (input.refunded.status === "failed" && artistEmail) {
      // Operator instruction goes to Dim alone, never to the client.
      await resend.emails.send({
        from: emailFrom,
        to: artistEmail,
        subject: `Refund needed: ${input.clientName} (ref ${input.reference})`,
        html: shell(`
          <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">Refund needed</h1>
          <p style="margin:0">The automatic ${site.deposit.label} refund for ${escapeHtml(input.clientName)} (ref ${input.reference}) failed. Refund it in Stripe: Payments, find the reference, Refund.</p>
        `),
      });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function sendMoveNotice(input: {
  reference: string;
  cancelToken: string;
  clientName: string;
  clientEmail: string;
  oldStartsAt: string;
  oldEndsAt: string;
  newStartsAt: string;
  newEndsAt: string;
  reason: string | null;
  movedBy: "client" | "artist";
}): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };

  const recipients = [input.clientEmail];
  const artistEmail = process.env.ARTIST_NOTIFICATION_EMAIL;
  if (artistEmail) recipients.push(artistEmail);
  const manageUrl = `${siteUrl()}/booking/${input.reference}?t=${input.cancelToken}`;

  try {
    await resend.emails.send({
      from: emailFrom,
      to: recipients,
      subject: `Appointment moved: ${when(input.newStartsAt, input.newEndsAt)}`,
      html: shell(`
        <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">Appointment moved</h1>
        <p style="margin:0 0 20px">${escapeHtml(input.clientName)}'s appointment (ref ${input.reference}) has been moved${input.movedBy === "artist" ? " by the studio" : ""}.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Was</td><td style="padding:8px 0;text-decoration:line-through">${when(input.oldStartsAt, input.oldEndsAt)}</td></tr>
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Now</td><td style="padding:8px 0;font-weight:600">${when(input.newStartsAt, input.newEndsAt)}</td></tr>
          ${input.reason ? `<tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Reason</td><td style="padding:8px 0">${escapeHtml(input.reason)}</td></tr>` : ""}
        </table>
        <p style="margin:0;font-size:14px">The ${site.deposit.label} deposit carries over. <a href="${manageUrl}" style="color:#1a1a1a">Manage your booking</a></p>
      `),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** The slot went before a late payment landed, so the deposit was refunded. */
export async function sendLatePaymentRefund(input: {
  clientName: string;
  clientEmail: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };

  try {
    await resend.emails.send({
      from: emailFrom,
      to: input.clientEmail,
      subject: "Your deposit has been refunded",
      html: shell(`
        <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">That slot has gone, sorry</h1>
        <p style="margin:0 0 20px">Hi ${escapeHtml(input.clientName)}, your payment for ${when(input.startsAt, input.endsAt)} came through after the 30-minute hold ran out, and someone else had booked the slot in the meantime. Your ${site.deposit.label} deposit has been refunded in full.</p>
        <p style="margin:0"><a href="${siteUrl()}/book" style="color:#1a1a1a">Choose another time</a></p>
      `),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** A custom booking Dim made by hand: here's the link to pay the deposit. */
export async function sendDepositRequest(input: {
  clientName: string;
  clientEmail: string;
  startsAt: string;
  endsAt: string;
  payUrl: string;
  priceLabel: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };
  try {
    await resend.emails.send({
      from: emailFrom,
      to: input.clientEmail,
      subject: `Secure your appointment: ${when(input.startsAt, input.endsAt)}`,
      html: shell(`
        <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">Your appointment is held for you</h1>
        <p style="margin:0 0 20px">Hi ${escapeHtml(input.clientName)}, ${site.artist} has set aside <strong>${when(input.startsAt, input.endsAt)}</strong> for you${input.priceLabel ? ` (${escapeHtml(input.priceLabel)})` : ""}. Pay the ${site.deposit.label} deposit within 23 hours to confirm it. It comes off your final price.</p>
        <p style="margin:0 0 24px"><a href="${input.payUrl}" style="display:inline-block;background:#14110f;color:#faf8f5;padding:12px 20px;border-radius:4px;text-decoration:none">Pay ${site.deposit.label} deposit</a></p>
        <p style="margin:0;font-size:14px;color:#5a5550">${TERMS_SENTENCE}</p>
      `),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
