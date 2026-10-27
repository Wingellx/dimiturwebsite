import "server-only";

import { site, siteUrl, sessionText, type BookingSession } from "./config";
import { studioDateLabel, studioTimeLabel } from "./availability";

/**
 * Booking alerts to a Slack channel through an incoming webhook. Best-effort
 * like email: a Slack outage must never break a booking, so failures are
 * logged and swallowed.
 */
export async function postToSlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) console.error("Slack webhook failed", response.status);
  } catch (error) {
    console.error("Slack webhook failed", error);
  }
}

function when(startsAt: string, endsAt: string): string {
  return `${studioDateLabel(startsAt)}, ${studioTimeLabel(startsAt)}–${studioTimeLabel(endsAt)}`;
}

/** Slack's mrkdwn treats &, < and > specially; client text must not break the message. */
function clean(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function newBookingAlert(input: {
  clientName: string;
  clientPhone: string | null;
  startsAt: string;
  endsAt: string;
  session: BookingSession;
  priceLabel?: string | null;
  depositPaid: boolean;
  placement: string | null;
  sizeEstimate: string | null;
  notes: string | null;
  imageCount: number;
}): string {
  const lines = [
    `:calendar: *New booking* — ${clean(input.clientName)}`,
    `*${when(input.startsAt, input.endsAt)}* · ${sessionText(input.session, input.priceLabel)} · ${input.depositPaid ? `${site.deposit.label} deposit paid` : "no deposit (added by you)"}`,
    input.placement || input.sizeEstimate
      ? `${[input.placement, input.sizeEstimate].filter(Boolean).map((v) => clean(v as string)).join(" · ")}`
      : null,
    input.notes ? `> ${clean(input.notes).replace(/\n/g, "\n> ")}` : null,
    input.clientPhone ? `:telephone_receiver: ${clean(input.clientPhone)}` : null,
    `${input.imageCount} reference image${input.imageCount === 1 ? "" : "s"} · <${siteUrl()}/admin|Open admin>`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function cancellationAlert(input: {
  clientName: string;
  startsAt: string;
  endsAt: string;
  cancelledBy: "client" | "artist";
  refund: "refunded" | "failed" | "none";
}): string {
  const refund =
    input.refund === "refunded" ? "Deposit refunded." : input.refund === "failed" ? ":warning: *Refund failed — do it in Stripe.*" : "";
  return `:x: *Cancelled* — ${clean(input.clientName)}, ${when(input.startsAt, input.endsAt)} (by ${input.cancelledBy === "artist" ? "you" : "the client"}). ${refund}`.trim();
}

export function moveAlert(input: {
  clientName: string;
  oldStartsAt: string;
  oldEndsAt: string;
  newStartsAt: string;
  newEndsAt: string;
  reason: string | null;
  movedBy: "client" | "artist";
}): string {
  return [
    `:arrows_counterclockwise: *Moved* — ${clean(input.clientName)} (by ${input.movedBy === "artist" ? "you" : "the client"})`,
    `~${when(input.oldStartsAt, input.oldEndsAt)}~ → *${when(input.newStartsAt, input.newEndsAt)}*`,
    input.reason ? `> ${clean(input.reason)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
