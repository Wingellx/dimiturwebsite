import "server-only";

import { Resend } from "resend";
import { site, emailFrom, siteUrl } from "./config";
import { studioDateLabel, studioTimeLabel } from "./availability";

type BookingEmailInput = {
  reference: string;
  cancelToken: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string | null;
  startsAt: string;
  endsAt: string;
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
      subject: `Your tattoo appointment — ${when(booking.startsAt, booking.endsAt)}`,
      html: shell(`
        <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">You're booked in</h1>
        <p style="margin:0 0 20px">Hi ${escapeHtml(booking.clientName)}, your appointment with ${site.artist} is confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">When</td><td style="padding:8px 0;font-weight:600">${when(booking.startsAt, booking.endsAt)}</td></tr>
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Reference</td><td style="padding:8px 0;font-family:ui-monospace,monospace">${booking.reference}</td></tr>
          ${booking.placement ? `<tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Placement</td><td style="padding:8px 0">${escapeHtml(booking.placement)}</td></tr>` : ""}
          ${booking.sizeEstimate ? `<tr><td style="padding:8px 0;color:#8a8580;font-size:14px">Size</td><td style="padding:8px 0">${escapeHtml(booking.sizeEstimate)}</td></tr>` : ""}
        </table>
        <p style="margin:0 0 24px;font-size:14px;color:#5a5550">Need to change or cancel? <a href="${manageUrl}" style="color:#1a1a1a">Manage your booking</a>. Please give as much notice as you can.</p>
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
      subject: `New booking — ${booking.clientName}, ${when(booking.startsAt, booking.endsAt)}`,
      html: shell(`
        <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">New booking</h1>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
          <tr><td style="padding:8px 0;color:#8a8580;font-size:14px">When</td><td style="padding:8px 0;font-weight:600">${when(booking.startsAt, booking.endsAt)}</td></tr>
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
      subject: `Appointment cancelled — ${when(input.startsAt, input.endsAt)}`,
      html: shell(`
        <h1 style="font-size:22px;font-weight:600;margin:0 0 20px">Appointment cancelled</h1>
        <p style="margin:0 0 20px">The appointment on <strong>${when(input.startsAt, input.endsAt)}</strong> (ref ${input.reference}) has been cancelled${input.cancelledBy === "artist" ? " by the studio" : ""}. That slot is now free for someone else.</p>
        <p style="margin:0"><a href="${siteUrl()}/book" style="color:#1a1a1a">Book another time</a></p>
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
