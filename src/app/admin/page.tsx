import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/admin-auth";
import {
  listBookings,
  getBookingImages,
  getAvailabilityRules,
  getAvailabilityExceptions,
  type Booking,
} from "@/lib/data";
import { studioDateLabel, studioTimeLabel } from "@/lib/availability";
import {
  logout,
  artistCancelBooking,
  markCompleted,
  saveRule,
  deleteRule,
  closeDate,
  deleteException,
} from "@/app/actions/admin";

export const metadata: Metadata = {
  title: "Studio admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

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

  const [bookings, rules, exceptions] = await Promise.all([
    listBookings(),
    getAvailabilityRules(),
    getAvailabilityExceptions(),
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
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mb-16">
        <h2 className="mb-2 font-display text-2xl">Weekly hours</h2>
        <p className="mb-5 text-sm text-muted">
          These repeat every week. Slot length decides how long each appointment
          runs — set it to how long you actually want a session to be.
        </p>

        <ul className="mb-6 divide-y divide-line border-y border-line">
          {rules.length === 0 ? (
            <li className="py-5 text-sm text-muted">
              No hours set — nobody can book until you add some.
            </li>
          ) : (
            rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3.5"
              >
                <div className="text-sm">
                  <span className="font-medium">{DAY_NAMES[rule.day_of_week]}</span>
                  <span className="text-ink-soft">
                    {" "}
                    · {rule.start_time.slice(0, 5)}–{rule.end_time.slice(0, 5)}
                  </span>
                  <span className="text-muted">
                    {" "}
                    · {rule.slot_minutes / 60}h sessions
                  </span>
                </div>
                <form action={deleteRule}>
                  <input type="hidden" name="id" value={rule.id} />
                  <button
                    type="submit"
                    className="text-sm text-muted underline underline-offset-4 hover:text-ink"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>

        <form
          action={saveRule}
          className="grid gap-3 rounded-sm border border-line bg-paper-raised p-4 sm:grid-cols-5 sm:items-end"
        >
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Day</span>
            <select
              name="dayOfWeek"
              defaultValue="2"
              className="h-11 w-full rounded-sm border border-line-strong bg-paper px-2 text-base"
            >
              {DAY_NAMES.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">From</span>
            <input
              type="time"
              name="startTime"
              defaultValue="10:00"
              required
              className="h-11 w-full rounded-sm border border-line-strong bg-paper px-2 text-base"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">To</span>
            <input
              type="time"
              name="endTime"
              defaultValue="18:00"
              required
              className="h-11 w-full rounded-sm border border-line-strong bg-paper px-2 text-base"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Session</span>
            <select
              name="slotMinutes"
              defaultValue="240"
              className="h-11 w-full rounded-sm border border-line-strong bg-paper px-2 text-base"
            >
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
              <option value="240">4 hours</option>
              <option value="360">6 hours</option>
            </select>
          </label>
          <button
            type="submit"
            className="h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper"
          >
            Add hours
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-display text-2xl">Days off</h2>
        <p className="mb-5 text-sm text-muted">
          Block a single date — holiday, convention, anything. This overrides
          your weekly hours.
        </p>

        {exceptions.length > 0 ? (
          <ul className="mb-6 divide-y divide-line border-y border-line">
            {exceptions.map((exception) => (
              <li
                key={exception.id}
                className="flex items-center justify-between gap-3 py-3.5 text-sm"
              >
                <span>
                  <span className="font-medium">{exception.date}</span>
                  {exception.note ? (
                    <span className="text-muted"> · {exception.note}</span>
                  ) : null}
                </span>
                <form action={deleteException}>
                  <input type="hidden" name="id" value={exception.id} />
                  <button
                    type="submit"
                    className="text-muted underline underline-offset-4 hover:text-ink"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        <form
          action={closeDate}
          className="grid gap-3 rounded-sm border border-line bg-paper-raised p-4 sm:grid-cols-3 sm:items-end"
        >
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Date</span>
            <input
              type="date"
              name="date"
              required
              className="h-11 w-full rounded-sm border border-line-strong bg-paper px-2 text-base"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Reason (optional)</span>
            <input
              type="text"
              name="note"
              placeholder="Holiday"
              className="h-11 w-full rounded-sm border border-line-strong bg-paper px-3 text-base"
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper"
          >
            Block date
          </button>
        </form>
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
}: {
  booking: Booking;
  images: string[];
}) {
  return (
    <li className="rounded-sm border border-line bg-paper-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {studioDateLabel(booking.starts_at)} ·{" "}
            {studioTimeLabel(booking.starts_at)}–{studioTimeLabel(booking.ends_at)}
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
            Cancel & notify client
          </button>
        </form>
      </div>
    </li>
  );
}
