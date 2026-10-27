import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAvailability, getBookingByReference } from "@/lib/data";
import { clientCanChange } from "@/lib/policy";
import { moveBooking, releaseHold } from "@/app/actions/booking";
import { openCheckoutUrl } from "@/lib/stripe";
import { MoveBooking } from "@/components/move-booking";
import { PaymentPending } from "@/components/payment-pending";
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

  if (booking.status === "pending_payment" || booking.status === "expired") {
    const pending = booking.status === "pending_payment";
    const ownsHold = Boolean(token) && token === booking.cancel_token;
    const resumeUrl =
      pending && ownsHold && booking.stripe_checkout_session_id
        ? await openCheckoutUrl(booking.stripe_checkout_session_id)
        : null;
    return (
      <div className="container-page py-12 md:py-20">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
            {pending ? "Payment" : "Not completed"}
          </p>
          <h1 className="mt-4 font-display text-4xl leading-none md:text-5xl">
            {pending ? "Almost there" : "This booking wasn't completed"}
          </h1>
          {pending && resumeUrl ? (
            <>
              <p className="mt-4 text-base leading-relaxed text-ink-soft">
                Your slot is held while you pay the {site.deposit.label} deposit.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={resumeUrl} className="rounded-sm bg-ink px-6 py-3 text-sm font-medium text-paper">
                  Continue to payment
                </a>
                <form action={releaseHold}>
                  <input type="hidden" name="reference" value={booking.reference} />
                  <input type="hidden" name="token" value={token} />
                  <button type="submit" className="rounded-sm border border-line-strong px-6 py-3 text-sm">
                    Choose a different time
                  </button>
                </form>
              </div>
            </>
          ) : pending ? (
            <PaymentPending />
          ) : (
            <>
              <p className="mt-4 text-base leading-relaxed text-ink-soft">
                {booking.refunded_at
                  ? `Your payment came through after the ${site.paymentHoldMinutes}-minute hold ran out and the slot had been taken, so your ${site.deposit.label} deposit has been refunded in full.`
                  : `The deposit wasn't paid within ${site.paymentHoldMinutes} minutes, so the slot was released. Nothing has been charged.`}
              </p>
              <Link href="/book" className="mt-8 inline-block rounded-sm bg-ink px-6 py-3 text-sm font-medium text-paper">
                Book a time
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const cancelled = booking.status === "cancelled";
  const ownsLink = Boolean(token) && token === booking.cancel_token;
  const canChange = booking.status === "confirmed" && clientCanChange(booking.starts_at, new Date(), booking.refund_locked);
  const moveOptions =
    ownsLink && canChange
      ? (await getAvailability())
          .flatMap((day) => day.slots)
          .filter((slot) => slot.session === booking.session_type)
          .map((slot) => ({
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            label: `${studioDateLabel(slot.startsAt)} · ${slot.label}`,
          }))
      : [];

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
            {booking.refunded_at ? " Your deposit has been refunded to your card." : ""}
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
          <Row label="Session">
            {site.sessions[booking.session_type].label}{" "}
            <span className="text-ink-soft">
              ({site.sessions[booking.session_type].price}, paid on the day)
            </span>
          </Row>
          {booking.deposit_paid_at ? (
            <Row label="Deposit">
              {booking.refunded_at
                ? `${site.deposit.label} refunded`
                : `${site.deposit.label} paid, taken off your final price`}
            </Row>
          ) : null}
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

        {!cancelled && ownsLink && canChange ? (
          <div className="mt-10 space-y-6">
            <MoveBooking
              action={moveBooking}
              options={moveOptions}
              hidden={{ reference: booking.reference, token }}
              reasonRequired
            />
            <CancelBooking reference={booking.reference} token={token} hasDeposit={Boolean(booking.deposit_paid_at)} />
            <p className="text-xs leading-relaxed text-muted">
              You can move or cancel online up to {site.changeCutoffHours} hours before your appointment.
            </p>
          </div>
        ) : null}

        {!cancelled && ownsLink && !canChange ? (
          <div className="mt-10 rounded-sm border border-line bg-paper-raised p-5 text-sm leading-relaxed">
            <p className="font-medium">
              {booking.refund_locked
                ? "This appointment was moved inside the 72-hour window, so the deposit is non-refundable."
                : "It's too close to your appointment to cancel or change it online."}
            </p>
            <p className="mt-2 text-ink-soft">
              If you need to move it, message {site.artist.split(" ")[0]} directly
              {site.contact.instagram ? (
                <>
                  {" "}on Instagram{" "}
                  <a className="underline" href={`https://instagram.com/${site.contact.instagram.replace("@", "")}`}>
                    {site.contact.instagram}
                  </a>
                </>
              ) : null}
              {site.contact.phone ? (
                <>
                  {" "}or call{" "}
                  <a className="underline" href={`tel:${site.contact.phone.replace(/\s/g, "")}`}>
                    {site.contact.phone}
                  </a>
                </>
              ) : null}
              . If you don&apos;t attend, the {site.deposit.label} deposit isn&apos;t refunded.
            </p>
          </div>
        ) : null}

        {!cancelled && !ownsLink ? (
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
