import { TZDate } from "@date-fns/tz";
import { site } from "./config";

export type SessionType = "half" | "full";

/**
 * Dim's shift-job rota. `pattern` is one letter per day starting at
 * `anchor_date`: W = at the shift job, O = off, which is a tattoo day. It
 * repeats forever in both directions.
 */
export type RotaSettings = {
  pattern: string;
  anchor_date: string; // "YYYY-MM-DD"
  day_start: string; // "HH:MM" or "HH:MM:SS"
  day_end: string;
};

/** A one-off change to a single date, made by Dim from the admin calendar. */
export type DayOverride = {
  date: string; // "YYYY-MM-DD"
  open: boolean;
  /** Both set for custom hours (full day only), both null for default hours. */
  start_time: string | null;
  end_time: string | null;
};

export type DayPlan = {
  date: string;
  source: "rota" | "override";
  open: boolean;
  window: { start: string; end: string } | null;
  /** False when the day has custom hours: those days sell a full day only. */
  halves: boolean;
};

export type TakenSlot = { starts_at: string; ends_at: string };

export type Slot = {
  /** ISO instant. This is what gets submitted and stored. */
  startsAt: string;
  endsAt: string;
  session: SessionType;
  /** "Morning · 10:00–14:00" in studio-local time, for display. */
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

/** "10:00:00" or "10:00" -> "10:00", so database and form values compare equal. */
function hhmm(value: string): string {
  return value.slice(0, 5);
}

function minutesOf(value: string): number {
  const { hours, minutes } = parseTime(value);
  return hours * 60 + minutes;
}

function minutesToHhmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Whole calendar days from `from` to `to`, both "YYYY-MM-DD". */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parseDate(from);
  const [ty, tm, td] = parseDate(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / (24 * 60 * MINUTE));
}

/**
 * Counts calendar dates, never instants, so the two days a year the clocks
 * change cannot shift which day of the rota a date lands on.
 */
export function isRotaWorkingDay(date: string, rota: RotaSettings): boolean {
  const length = rota.pattern.length;
  const index = ((daysBetween(rota.anchor_date, date) % length) + length) % length;
  return rota.pattern[index] === "W";
}

/** What a date offers once the rota and any override for it are combined. */
export function planForDate(
  date: string,
  rota: RotaSettings,
  overrides: DayOverride[],
): DayPlan {
  const defaultWindow = { start: hhmm(rota.day_start), end: hhmm(rota.day_end) };
  const override = overrides.find((o) => o.date === date);

  if (override) {
    if (!override.open) {
      return { date, source: "override", open: false, window: null, halves: false };
    }
    const custom = override.start_time && override.end_time
      ? { start: hhmm(override.start_time), end: hhmm(override.end_time) }
      : null;
    const window = custom ?? defaultWindow;
    const isDefault = window.start === defaultWindow.start && window.end === defaultWindow.end;
    return { date, source: "override", open: true, window, halves: isDefault };
  }

  const open = !isRotaWorkingDay(date, rota);
  return {
    date,
    source: "rota",
    open,
    window: open ? defaultWindow : null,
    halves: open,
  };
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

/** The sessions a day's plan would sell, before anything is taken. */
type Candidate = { session: SessionType; name: string; start: string; end: string };

function candidateSlots(plan: DayPlan): Candidate[] {
  if (!plan.open || !plan.window) return [];
  const { start, end } = plan.window;
  const out: Candidate[] = [{ session: "full", name: "Full day", start, end }];
  if (plan.halves) {
    const middle = minutesToHhmm(Math.floor((minutesOf(start) + minutesOf(end)) / 2));
    out.push(
      { session: "half", name: "Morning", start, end: middle },
      { session: "half", name: "Afternoon", start: middle, end },
    );
  }
  return out;
}

/**
 * "Morning" / "Afternoon" / "Full day" for an existing booking, read from the
 * booking's own start time. Deliberately not from the day's current hours:
 * Dim can change or close a day after it's booked, and the label must not flip.
 */
export function partOfDay(startsAt: string, session: SessionType): "Morning" | "Afternoon" | "Full day" {
  if (session === "full") return "Full day";
  return minutesOf(studioTimeLabel(startsAt)) < 13 * 60 ? "Morning" : "Afternoon";
}

/**
 * The single source of truth for "what can someone book".
 *
 * Pure and deterministic given its inputs, so the same function runs on the
 * server when rendering the picker AND inside the booking action when
 * re-validating the chosen slot. A slot that the client sends back is only
 * accepted if this function would have offered it — otherwise a crafted
 * request could book a shift day, or a full day on top of a booked morning.
 */
export function buildAvailability(input: {
  rota: RotaSettings;
  overrides: DayOverride[];
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
    const plan = planForDate(date, input.rota, input.overrides);
    const slots: Slot[] = [];

    for (const candidate of candidateSlots(plan)) {
      const startsAt = studioInstant(date, parseTime(candidate.start));
      const endsAt = studioInstant(date, parseTime(candidate.end));

      if (startsAt.getTime() < earliest) continue;
      if (overlapsTaken(startsAt, endsAt, taken)) continue;

      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        session: candidate.session,
        label: `${candidate.name} · ${studioTimeLabel(startsAt)}–${studioTimeLabel(endsAt)}`,
      });
    }

    return { date, slots };
  });
}

/** The furthest-out date a client is allowed to book. */
export function bookingHorizon(now = new Date()): string {
  const end = new Date(now.getTime() + site.bookingWindowDays * 24 * 60 * MINUTE);
  return studioDateKey(end);
}
