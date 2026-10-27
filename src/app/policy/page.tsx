import type { Metadata } from "next";
import Link from "next/link";

import { instagramUrl, site, TERMS_SENTENCE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Booking & deposit policy",
  description: `How deposits, cancellations and changes work when you book with ${site.artist}.`,
};

const POINTS = [
  `A ${site.deposit.label} deposit secures your slot. It comes off your final price, and the rest is paid on the day.`,
  `Cancel at least ${site.changeCutoffHours} hours before your appointment and your deposit is refunded, minus the card processing fee our payment provider charges (usually about £1). That fee isn't returned to us either.`,
  `You can move your appointment online, to any open slot, up to ${site.changeCutoffHours} hours before. The deposit carries over.`,
  `Less than ${site.changeCutoffHours} hours before, appointments can't be cancelled. To move one, message ${site.artist.split(" ")[0]} directly.`,
  "If you don't attend, the deposit isn't refunded.",
  `If ${site.artist.split(" ")[0]} has to cancel, your deposit is always refunded in full.`,
];

export default function PolicyPage() {
  return (
    <div className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-4xl leading-none md:text-5xl">Booking & deposit policy</h1>
        <p className="mt-5 text-base leading-relaxed text-ink-soft">{TERMS_SENTENCE}</p>
        <ul className="mt-8 space-y-4 border-t border-line pt-8 text-base leading-relaxed">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-3">
              <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {instagramUrl() ? (
          <p className="mt-8 text-sm text-muted">
            Questions about a booking?{" "}
            <a href={instagramUrl() ?? ""} target="_blank" rel="noreferrer noopener" className="text-ink underline underline-offset-4">
              Message {site.artist.split(" ")[0]} on Instagram
            </a>
            .
          </p>
        ) : null}
        <Link href="/book" className="mt-10 inline-block rounded-sm bg-ink px-6 py-3 text-sm font-medium text-paper">
          Book an appointment
        </Link>
      </div>
    </div>
  );
}
