"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { resetDay, saveRota, setDay } from "@/app/actions/admin";
import type { DayPlan, RotaSettings, SessionType } from "@/lib/availability";

export type DayTile = {
  date: string;
  plan: DayPlan;
  /** What the rota alone would give, so the sheet can say what reset does. */
  rotaOpen: boolean;
  bookings: {
    reference: string;
    client_name: string;
    session_type: SessionType | "custom";
    /** "Morning", "Afternoon" or "Full day", worked out on the server. */
    part: string;
    time: string;
  }[];
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Dim's diary on his phone: every date the site can sell, coloured by what it
 * is, with one tap to open, close or re-time a day. Each change saves straight
 * away through a server action, and the page re-renders with the new state.
 */
export function AdminCalendar({ days, rota }: { days: DayTile[]; rota: RotaSettings }) {
  const [selected, setSelected] = useState<string | null>(null);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const months = useMemo(() => groupByMonth(days), [days]);
  const today = days[0]?.date;
  const tile = selected ? byDate.get(selected) : undefined;

  return (
    <div className="max-w-md">
      <Legend />

      <div className="space-y-10">
        {months.map(({ month, cells }) => (
          <div key={month}>
            <p className="mb-3 font-display text-2xl">{monthLabel(month)}</p>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((label, index) => (
                <div key={index} className="pb-1 text-center text-[11px] tracking-wider text-muted">
                  {label}
                </div>
              ))}
              {cells.map((cell, index) =>
                cell ? (
                  <DayButton
                    key={cell.date}
                    tile={cell}
                    isToday={cell.date === today}
                    onSelect={() => setSelected(cell.date)}
                  />
                ) : (
                  <div key={`pad-${index}`} aria-hidden />
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <RotaSettingsForm rota={rota} />

      {tile ? (
        // Keyed on the day's state so the sheet starts fresh after each save
        // (otherwise a "close anyway?" prompt would outlive the close).
        <DaySheet
          key={`${tile.date}-${tile.plan.open}-${tile.plan.window?.start}-${tile.plan.window?.end}`}
          tile={tile}
          rota={rota}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function DayButton({
  tile,
  isToday,
  onSelect,
}: {
  tile: DayTile;
  isToday: boolean;
  onSelect: () => void;
}) {
  const { plan, bookings } = tile;
  const dayOfMonth = Number(tile.date.slice(8));
  const closedByDim = plan.source === "override" && !plan.open;
  const bookedWhileClosed = !plan.open && bookings.length > 0;
  const openedByDim = plan.source === "override" && plan.open && !tile.rotaOpen;
  const customHours = plan.open && !plan.halves;
  const full = bookings.some((b) => b.session_type === "full" || b.session_type === "custom");
  const morning = bookings.some((b) => b.part === "Morning");
  const afternoon = bookings.some((b) => b.part === "Afternoon");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${dayOfMonth} ${monthLabel(tile.date.slice(0, 7))}: ${describe(tile)}`}
      className={[
        "relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-sm border text-sm",
        plan.open ? "border-line-strong bg-paper-raised text-ink" : "border-transparent text-muted/60",
        closedByDim ? "border-dashed border-line-strong line-through" : "",
        openedByDim ? "border-ink" : "",
        isToday ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : "",
        bookedWhileClosed ? "border-ink bg-ink/10 text-ink" : "",
      ].join(" ")}
    >
      {bookedWhileClosed ? (
        <span aria-hidden className="absolute top-0.5 right-1 text-[11px] font-bold">!</span>
      ) : null}
      <span className={plan.open ? "font-medium" : ""}>{dayOfMonth}</span>
      {customHours && plan.window ? (
        <span className="text-[9px] leading-none text-ink-soft">
          {plan.window.start.slice(0, 2)}–{plan.window.end.slice(0, 2)}
        </span>
      ) : null}
      {bookings.length > 0 ? (
        <span aria-hidden className="absolute inset-x-1 bottom-1 flex gap-0.5">
          {full ? (
            <span className="h-1 flex-1 rounded-full bg-ink" />
          ) : (
            <>
              <span className={`h-1 flex-1 rounded-full ${morning ? "bg-ink" : "bg-transparent"}`} />
              <span className={`h-1 flex-1 rounded-full ${afternoon ? "bg-ink" : "bg-transparent"}`} />
            </>
          )}
        </span>
      ) : null}
    </button>
  );
}

function DaySheet({ tile, rota, onClose }: { tile: DayTile; rota: RotaSettings; onClose: () => void }) {
  const { plan, bookings } = tile;
  const [confirmClose, setConfirmClose] = useState(false);
  const overridden = plan.source === "override";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={longDate(tile.date)}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40" />

      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-md bg-paper p-5 pb-8 shadow-xl sm:rounded-md">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl leading-tight">{longDate(tile.date)}</p>
            <p className="mt-1 text-sm text-muted">{describe(tile)}</p>
          </div>
          <button type="button" onClick={onClose} className="h-11 w-11 shrink-0 rounded-sm border border-line text-lg" aria-label="Close">
            ×
          </button>
        </div>

        {!plan.open && bookings.length > 0 ? (
          <p className="mb-4 rounded-sm border border-ink bg-ink/5 p-3 text-sm font-medium">
            This day is closed but you still have {bookings.length === 1 ? "a client" : "clients"} booked.
            Open the day, or move or cancel {bookings.length === 1 ? "them" : "each one"} from the list above.
          </p>
        ) : null}

        {bookings.length > 0 ? (
          <ul className="mb-5 space-y-2">
            {bookings.map((b) => (
              <li key={b.reference} className="rounded-sm border border-line bg-paper-raised px-3 py-2.5 text-sm">
                <span className="font-medium">{b.part}</span> · {b.time} · {b.client_name}
              </li>
            ))}
          </ul>
        ) : null}

        {confirmClose ? (
          <div className="mb-4 rounded-sm border border-ink/20 bg-ink/5 p-3 text-sm">
            <p>
              {bookings.length === 1 ? "This booking stays" : "These bookings stay"} — closing only stops new
              bookings. Move or cancel {bookings.length === 1 ? "it" : "them"} yourself from the list above the
              calendar.
            </p>
            <div className="mt-3 flex gap-2">
              <form action={setDay} className="flex-1">
                <input type="hidden" name="date" value={tile.date} />
                <input type="hidden" name="open" value="false" />
                <SubmitButton className="w-full bg-ink text-paper">Close anyway</SubmitButton>
              </form>
              <button type="button" onClick={() => setConfirmClose(false)} className="h-12 flex-1 rounded-sm border border-line-strong text-sm">
                Keep open
              </button>
            </div>
          </div>
        ) : plan.open ? (
          bookings.length > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              className="mb-4 h-12 w-full rounded-sm border border-line-strong text-sm font-medium"
            >
              Close this day
            </button>
          ) : (
            <form action={setDay} className="mb-4">
              <input type="hidden" name="date" value={tile.date} />
              <input type="hidden" name="open" value="false" />
              <SubmitButton className="w-full border border-line-strong">Close this day</SubmitButton>
            </form>
          )
        ) : (
          <form action={setDay} className="mb-4">
            <input type="hidden" name="date" value={tile.date} />
            <input type="hidden" name="open" value="true" />
            <SubmitButton className="w-full bg-ink text-paper">Open for bookings</SubmitButton>
          </form>
        )}

        {plan.open ? (
          <form action={setDay} className="rounded-sm border border-line p-4">
            <input type="hidden" name="date" value={tile.date} />
            <input type="hidden" name="open" value="true" />
            <p className="text-sm font-medium">Hours for this day</p>
            <p className="mt-1 text-xs text-muted">
              Changing the hours makes it a full day only — no half days.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted">From</span>
                <input type="time" name="startTime" defaultValue={plan.window?.start} required className="h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-2 text-base" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">To</span>
                <input type="time" name="endTime" defaultValue={plan.window?.end} required className="h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-2 text-base" />
              </label>
            </div>
            <SubmitButton className="mt-3 w-full border border-line-strong">Save hours</SubmitButton>
          </form>
        ) : null}

        {overridden ? (
          <form action={resetDay} className="mt-4">
            <input type="hidden" name="date" value={tile.date} />
            <SubmitButton className="w-full text-muted underline underline-offset-4">
              Reset to rota (
              {tile.rotaOpen
                ? `tattoo day, ${rota.day_start.slice(0, 5)}–${rota.day_end.slice(0, 5)}`
                : "shift day, closed"}
              )
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function RotaSettingsForm({ rota }: { rota: RotaSettings }) {
  const [pattern, setPattern] = useState(rota.pattern);

  return (
    <details className="mt-12 rounded-sm border border-line">
      <summary className="cursor-pointer px-4 py-4 text-sm font-medium">Rota settings</summary>
      <form action={saveRota} className="space-y-5 border-t border-line p-4">
        <div>
          <p className="text-sm font-medium">Pattern</p>
          <p className="mt-1 text-xs text-muted">
            One box per day, starting on the anchor date. Tap to switch between shift (S) and tattoo
            day (T). It repeats forever.
          </p>
          <input type="hidden" name="pattern" value={pattern} />
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {pattern.split("").map((letter, index) => (
              <button
                key={index}
                type="button"
                onClick={() =>
                  setPattern((p) => p.slice(0, index) + (p[index] === "W" ? "O" : "W") + p.slice(index + 1))
                }
                className={`h-11 rounded-sm border text-sm font-medium ${letter === "W" ? "border-line text-muted" : "border-ink bg-ink text-paper"}`}
                aria-label={`Day ${index + 1}: ${letter === "W" ? "shift" : "tattoo day"}`}
              >
                {letter === "W" ? "S" : "T"}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Anchor date (day 1 of the pattern)</span>
          <input type="date" name="anchorDate" defaultValue={rota.anchor_date} required className="h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-2 text-base" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Tattoo days from</span>
            <input type="time" name="dayStart" defaultValue={rota.day_start.slice(0, 5)} required className="h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-2 text-base" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">To</span>
            <input type="time" name="dayEnd" defaultValue={rota.day_end.slice(0, 5)} required className="h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-2 text-base" />
          </label>
        </div>
        <SubmitButton className="w-full bg-ink text-paper">Save rota</SubmitButton>
      </form>
    </details>
  );
}

function Legend() {
  return (
    <ul className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
      <li className="flex items-center gap-1.5">
        <span className="h-4 w-4 rounded-sm border border-line-strong bg-paper-raised" /> Tattoo day
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-4 w-4 rounded-sm border border-transparent bg-line/40" /> Shift day
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-4 w-4 rounded-sm border border-dashed border-line-strong" /> Closed by you
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-1 w-4 rounded-full bg-ink" /> Booked (left = morning, right = afternoon)
      </li>
    </ul>
  );
}

function SubmitButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`h-12 rounded-sm px-4 text-sm font-medium disabled:opacity-50 ${className}`}>
      {pending ? "Saving…" : children}
    </button>
  );
}

function describe(tile: DayTile): string {
  const { plan, bookings } = tile;
  const booked = bookings.length > 0 ? ` · ${bookings.length} booked` : "";
  if (!plan.open) {
    return (plan.source === "override" ? "Closed by you" : "Shift day — closed") + booked;
  }
  const hours = plan.window ? `${plan.window.start}–${plan.window.end}` : "";
  const kind = plan.halves ? "half or full days" : "full day only";
  return `Open ${hours}, ${kind}${booked}`;
}

type Cell = DayTile | null;

/** Splits the days into calendar months, padded so each week starts Monday. */
function groupByMonth(days: DayTile[]): { month: string; cells: Cell[] }[] {
  const out: { month: string; cells: Cell[] }[] = [];
  for (const day of days) {
    const month = day.date.slice(0, 7);
    let group = out[out.length - 1];
    if (!group || group.month !== month) {
      const [y, m, d] = day.date.split("-").map(Number);
      const mondayIndex = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
      group = { month, cells: Array(mondayIndex).fill(null) };
      out.push(group);
    }
    group.cells.push(day);
  }
  return out;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
