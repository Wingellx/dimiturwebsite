import { TZDate } from "@date-fns/tz";
import { site } from "./config";

export type AvailabilityRule = {
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  slot_minutes: number;
};

export type AvailabilityException = {
  date: string; // "YYYY-MM-DD"
  kind: "closed" | "open";
  start_time: string | null;
  end_time: string | null;
  slot_minutes: number | null;
};

export type TakenSlot = { starts_at: string; ends_at: string };

export type Slot = {
  /** ISO instant. This is what gets submitted and stored. */
  startsAt: string;
  endsAt: string;
  /** "10:00" in studio-local time, for display. */
  label: string;
};

export type DayAvailability = {
  /** "YYYY-MM-DD" in studio-local time. */
  date: string;
  slots: Slot[];
};

const MINUTE = 60_000;

function parseTime(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(":");
  return { hours: Number(h), minutes: Number(m) };
}

/** "YYYY-MM-DD" -> its three numbers, without letting the local zone interfere. */
function parseDate(value: string): [number, number, number] {
  const [y, m, d] = value.split("-").map(Number);
  return [y, m, d];
}

/**
 * Turns a wall-clock time in the studio's zone into a real UTC instant.
 * Going through TZDate rather than `new Date(y, m, d, h)` is what keeps this
 * correct across a DST boundary — on those two days a year, the same wall time
 * is a different instant, and a naive construction silently books the wrong hour.
 */
export function studioInstant(
  date: string,
  time: { hours: number; minutes: number },
): Date {
  const [year, month, day] = parseDate(date);
  return new Date(
    new TZDate(
      year,
      month - 1,
      day,
      time.hours,
      time.minutes,
      0,
      0,
      site.timezone,
    ).getTime(),
  );
}

/** Formats an instant as the studio-local "YYYY-MM-DD" it falls on. */
export function studioDateKey(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: site.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Formats an instant as studio-local "HH:MM". */
export function studioTimeLabel(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: site.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** A human date like "Saturday 14 September" in studio-local terms. */
export function studioDateLabel(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: site.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

/** Studio-local weekday index (0 = Sunday), matching availability_rules. */
function studioWeekday(date: string): number {
  const [year, month, day] = parseDate(date);
  return new TZDate(year, month - 1, day, 12, 0, 0, 0, site.timezone).getDay();
}

/** Every "YYYY-MM-DD" from `from` to `to` inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = parseDate(from);
  const [ty, tm, td] = parseDate(to);
  const cursor = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

type Block = { start: string; end: string; slotMinutes: number };

/** The open blocks for one date, after exceptions are applied to the weekly rules. */
function blocksForDate(
  date: string,
  rules: AvailabilityRule[],
  exceptions: AvailabilityException[],
): Block[] {
  const onThisDate = exceptions.filter((e) => e.date === date);

  // A 'closed' exception wins outright — that is the point of it.
  if (onThisDate.some((e) => e.kind === "closed")) return [];

  const extraOpen = onThisDate.filter(
    (e) => e.kind === "open" && e.start_time && e.end_time,
  );
  if (extraOpen.length > 0) {
    return extraOpen.map((e) => ({
      start: e.start_time as string,
      end: e.end_time as string,
      slotMinutes: e.slot_minutes ?? 180,
    }));
  }

  const weekday = studioWeekday(date);
  return rules
    .filter((r) => r.day_of_week === weekday)
    .map((r) => ({
      start: r.start_time,
      end: r.end_time,
      slotMinutes: r.slot_minutes,
    }));
}

function overlapsTaken(
  startsAt: Date,
  endsAt: Date,
  taken: { start: number; end: number }[],
): boolean {
  const s = startsAt.getTime();
  const e = endsAt.getTime();
  return taken.some((t) => s < t.end && e > t.start);
}

/**
 * The single source of truth for "what can someone book".
 *
 * Pure and deterministic given its inputs, so the same function runs on the
 * server when rendering the picker AND inside the booking action when
 * re-validating the chosen slot. A slot that the client sends back is only
 * accepted if this function would have offered it — otherwise a crafted
 * request could book a Sunday at 3am.
 */
export function buildAvailability(input: {
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  taken: TakenSlot[];
  from: string;
  to: string;
  now?: Date;
}): DayAvailability[] {
  const now = input.now ?? new Date();
  const earliest = now.getTime() + site.minimumNoticeHours * 60 * MINUTE;

  const taken = input.taken.map((t) => ({
    start: new Date(t.starts_at).getTime(),
    end: new Date(t.ends_at).getTime(),
  }));

  return dateRange(input.from, input.to).map((date) => {
    const slots: Slot[] = [];

    for (const block of blocksForDate(date, input.rules, input.exceptions)) {
      const blockStart = studioInstant(date, parseTime(block.start));
      const blockEnd = studioInstant(date, parseTime(block.end));
      const step = block.slotMinutes * MINUTE;

      for (
        let cursor = blockStart.getTime();
        cursor + step <= blockEnd.getTime();
        cursor += step
      ) {
        const startsAt = new Date(cursor);
        const endsAt = new Date(cursor + step);

        if (startsAt.getTime() < earliest) continue;
        if (overlapsTaken(startsAt, endsAt, taken)) continue;

        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          label: studioTimeLabel(startsAt),
        });
      }
    }

    slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { date, slots };
  });
}

/** The furthest-out date a client is allowed to book. */
export function bookingHorizon(now = new Date()): string {
  const end = new Date(now.getTime() + site.bookingWindowDays * 24 * 60 * MINUTE);
  return studioDateKey(end);
}
