import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/admin-auth";
import {
  listBookings,
  getAvailability,
  getBookingImages,
  getBookingMoves,
  getRota,
  getDayOverrides,
  type Booking,
  type BookingMove,
} from "@/lib/data";
import { MoveBooking, type MoveOption } from "@/components/move-booking";
import {
  bookingHorizon,
  dateRange,
  partOfDay,
  planForDate,
  studioDateKey,
  studioDateLabel,
  studioTimeLabel,
  type DayOverride,
  type RotaSettings,
} from "@/lib/availability";
import { site } from "@/lib/config";
import { depositState } from "@/lib/policy";
import { logout, artistCancelBooking, artistMoveBooking, markCompleted } from "@/app/actions/admin";
import { AdminCalendar, type DayTile } from "@/components/admin-calendar";

export const metadata: Metadata = {
  title: "Studio admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** One tile per date from today to the booking horizon. */
function buildTiles(
  rota: RotaSettings,
  overrides: DayOverride[],
  bookings: Booking[],
): DayTile[] {
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  return dateRange(studioDateKey(new Date()), bookingHorizon()).map((date) => {
    const plan = planForDate(date, rota, overrides);
    return {
      date,
      plan,
      rotaOpen: planForDate(date, rota, []).open,
      bookings: confirmed
        .filter((b) => studioDateKey(b.starts_at) === date)
        .map((b) => ({
          reference: b.reference,
          client_name: b.client_name,
          session_type: b.session_type,
          part: partOfDay(b.starts_at, b.session_type),
          time: `${studioTimeLabel(b.starts_at)}–${studioTimeLabel(b.ends_at)}`,
        })),
    };
  });
}

/**
 * Kept outside the component because it reads the clock — a server component
 * still has to be a pure function of its inputs as far as React is concerned.
 */
function splitBookings(bookings: Booking[]): {
  upcoming: Booking[];
  past: Booking[];
} {
  const now = Date.now();

  const upcoming = bookings.filter(
    (b) => b.status === "confirmed" && new Date(b.starts_at).getTime() >= now,
  );
  const past = bookings
    .filter(
      (b) => b.status !== "confirmed" || new Date(b.starts_at).getTime() < now,
    )
    .reverse()
    .slice(0, 25);

  return { upcoming, past };
}

export default async function AdminPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");

  const [bookings, rota, overrides] = await Promise.all([
    listBookings(),
    getRota(),
    getDayOverrides(studioDateKey(new Date()), bookingHorizon()),
  ]);

  const { upcoming, past } = splitBookings(bookings);

  // Only the upcoming appointments need their references loading — signing URLs
  // for a year of history on every page view would be pointless work.
  const images = await Promise.all(
    upcoming.map(async (booking) => [
      booking.id,
      await getBookingImages(booking.id),
    ] as const),
  );
  const imagesById = new Map(images);
  const [movesById, availability] = await Promise.all([
    getBookingMoves(bookings.map((b) => b.id)),
    getAvailability(),
  ]);
  const optionsFor = (booking: Booking): MoveOption[] =>
    availability
      .flatMap((day) => day.slots)
      .filter((slot) => slot.session === booking.session_type)
      .map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        label: `${studioDateLabel(slot.startsAt)} · ${slot.label}`,
      }));

  return (
    <div className="container-page py-10 md:py-16">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-3xl leading-none md:text-4xl">Studio</h1>
          <p className="mt-2 text-sm text-muted">
            {upcoming.length} upcoming appointment
            {upcoming.length === 1 ? "" : "s"}
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-sm border border-line-strong px-4 py-2 text-sm hover:border-ink"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mb-16">
        <h2 className="mb-5 font-display text-2xl">Upcoming</h2>

        {upcoming.length === 0 ? (
          <p className="rounded-sm border border-dashed border-line-strong px-5 py-10 text-center text-sm text-muted">
            Nothing booked yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                images={imagesById.get(booking.id) ?? []}
                moves={movesById.get(booking.id) ?? []}
                moveOptions={optionsFor(booking)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mb-16">
        <h2 className="mb-2 font-display text-2xl">Your diary</h2>
        <p className="mb-5 text-sm text-muted">
          Worked out from your rota. Tap any day to close it, open it, or change its hours.
        </p>
        {rota ? (
          <AdminCalendar days={buildTiles(rota, overrides, bookings)} rota={rota} />
        ) : (
          <p className="rounded-sm border border-dashed border-line-strong px-5 py-10 text-center text-sm text-muted">
            The rota hasn&apos;t been set up in the database yet.
          </p>
        )}
      </section>

      {past.length > 0 ? (
        <section className="mt-16">
          <h2 className="mb-5 font-display text-2xl">History</h2>
          <ul className="divide-y divide-line border-y border-line text-sm">
            {past.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <span>
                  <span className="text-ink-soft">
                    {studioDateLabel(booking.starts_at)}
                  </span>{" "}
                  · {booking.client_name}
                </span>
                <span
                  className={
                    booking.status === "cancelled" ? "text-muted" : "text-ink-soft"
                  }
                >
                  {booking.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function BookingCard({
  booking,
  images,
  moves,
  moveOptions,
}: {
  booking: Booking;
  images: string[];
  moves: BookingMove[];
  moveOptions: MoveOption[];
}) {
  return (
    <li className="rounded-sm border border-line bg-paper-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {studioDateLabel(booking.starts_at)} ·{" "}
            {studioTimeLabel(booking.starts_at)}–{studioTimeLabel(booking.ends_at)}
          </p>
          <p className="mt-0.5 text-xs tracking-[0.08em] text-muted uppercase">
            {site.sessions[booking.session_type].label} · {site.sessions[booking.session_type].price}
            {" · "}
            {
              {
                none: "No deposit",
                paid: `${site.deposit.label} deposit paid`,
                refunded: "Deposit refunded",
                refund_needed: "Refund needed — do it in Stripe",
              }[depositState(booking)]
            }
            {booking.refund_locked ? " · Non-refundable (moved inside 72h)" : ""}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {booking.client_name} ·{" "}
            <a href={`mailto:${booking.client_email}`} className="underline underline-offset-2">
              {booking.client_email}
            </a>
            {booking.client_phone ? (
              <>
                {" · "}
                <a href={`tel:${booking.client_phone}`} className="underline underline-offset-2">
                  {booking.client_phone}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <span className="rounded-sm bg-paper px-2 py-1 font-mono text-xs text-muted">
          {booking.reference}
        </span>
      </div>

      {booking.placement || booking.size_estimate ? (
        <p className="mt-3 text-sm text-ink-soft">
          {[booking.placement, booking.size_estimate].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {booking.notes ? (
        <p className="mt-3 rounded-sm bg-paper px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {booking.notes}
        </p>
      ) : null}

      {images.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {images.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer noopener">
                {/* Signed, short-lived Supabase URLs — next/image would try to
                    cache them against an expiring source, so a plain img is right. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Client reference"
                  className="h-24 w-24 rounded-sm object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {moves.length > 0 ? (
        <ul className="mt-4 space-y-1 text-xs text-muted">
          {moves.map((move) => (
            <li key={move.created_at}>
              Moved by {move.moved_by === "artist" ? "you" : "client"}: {studioDateLabel(move.old_starts_at)}{" "}
              {studioTimeLabel(move.old_starts_at)} → {studioDateLabel(move.new_starts_at)}{" "}
              {studioTimeLabel(move.new_starts_at)}
              {move.reason ? ` — “${move.reason}”` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        <MoveBooking
          action={artistMoveBooking}
          options={moveOptions}
          hidden={{ id: booking.id }}
          reasonRequired={false}
          buttonLabel="Move"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <form action={markCompleted}>
          <input type="hidden" name="id" value={booking.id} />
          <button
            type="submit"
            className="rounded-sm border border-line-strong px-4 py-2 text-sm hover:border-ink"
          >
            Mark done
          </button>
        </form>
        <form action={artistCancelBooking}>
          <input type="hidden" name="id" value={booking.id} />
          <button
            type="submit"
            className="rounded-sm border border-line-strong px-4 py-2 text-sm text-muted hover:border-ink hover:text-ink"
          >
            Cancel, refund & notify client
          </button>
        </form>
      </div>
    </li>
  );
}
