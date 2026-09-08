import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getBookingByReference } from "@/lib/data";
import { studioDateLabel, studioTimeLabel } from "@/lib/availability";
import { site } from "@/lib/config";
import { CancelBooking } from "@/components/cancel-booking";

export const metadata: Metadata = {
  title: "Your appointment",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
  searchParams,
}: PageProps<"/booking/[reference]">) {
  const { reference } = await params;
  const query = await searchParams;
  const token = typeof query.t === "string" ? query.t : "";

  const booking = await getBookingByReference(reference);
  if (!booking) notFound();

  const cancelled = booking.status === "cancelled";

  return (
    <div className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
          {cancelled ? "Cancelled" : "Confirmed"}
        </p>
        <h1 className="mt-4 font-display text-4xl leading-none md:text-5xl">
          {cancelled ? "Appointment cancelled" : "You're booked in"}
        </h1>

        {cancelled ? (
          <p className="mt-4 text-base leading-relaxed text-ink-soft">
            This appointment has been cancelled and the slot released.
          </p>
        ) : (
          <p className="mt-4 text-base leading-relaxed text-ink-soft">
            A confirmation has been sent to{" "}
            <span className="text-ink">{booking.client_email}</span>. Keep this
            page if you need to make changes.
          </p>
        )}

        <dl className="mt-9 divide-y divide-line border-y border-line">
          <Row label="When">
            {studioDateLabel(booking.starts_at)}
            <br />
            <span className="text-ink-soft">
              {studioTimeLabel(booking.starts_at)}–{studioTimeLabel(booking.ends_at)}
            </span>
          </Row>
          <Row label="Reference">
            <span className="font-mono">{booking.reference}</span>
          </Row>
          <Row label="Name">{booking.client_name}</Row>
          {booking.placement ? (
            <Row label="Placement">{booking.placement}</Row>
          ) : null}
          {booking.size_estimate ? (
            <Row label="Size">{booking.size_estimate}</Row>
          ) : null}
          {booking.notes ? (
            <Row label="Notes">
              <span className="whitespace-pre-wrap">{booking.notes}</span>
            </Row>
          ) : null}
        </dl>

        {!cancelled && token ? (
          <div className="mt-10">
            <CancelBooking reference={booking.reference} token={token} />
          </div>
        ) : null}

        {!cancelled && !token ? (
          <p className="mt-8 text-sm leading-relaxed text-muted">
            To cancel or change this appointment, use the link in your
            confirmation email
            {site.contact.email ? (
              <>
                {" "}
                or email{" "}
                <a className="text-ink underline" href={`mailto:${site.contact.email}`}>
                  {site.contact.email}
                </a>
              </>
            ) : null}
            .
          </p>
        ) : null}

        <div className="mt-12 border-t border-line pt-8">
          <Link href="/" className="text-sm text-muted hover:text-ink">
            ← Back to {site.artist}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 py-4">
      <dt className="text-xs tracking-[0.1em] text-muted uppercase">{label}</dt>
      <dd className="col-span-2 text-sm leading-relaxed">{children}</dd>
    </div>
  );
}
