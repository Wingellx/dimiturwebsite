"use client";

import { useActionState, useMemo, useRef, useState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { createBooking, type BookingState } from "@/app/actions/booking";
import { downscaleImage } from "@/lib/image-resize";
import { site, TERMS_SENTENCE } from "@/lib/config";
import type { DayAvailability, SessionType, Slot } from "@/lib/availability";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Step = "session" | "date" | "time" | "details";

export function BookingFlow({ availability }: { availability: DayAvailability[] }) {
  const [step, setStep] = useState<Step>("session");
  const [session, setSession] = useState<SessionType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  const [state, formAction] = useActionState<BookingState, FormData>(
    createBooking,
    { ok: false },
  );

  // Days that have something free of the chosen session type. Everything else
  // renders disabled. Before a session is chosen this counts either type, so
  // the "no dates" state still means genuinely nothing.
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const day of availability) {
      const slots = session
        ? day.slots.filter((slot) => slot.session === session)
        : day.slots;
      if (slots.length > 0) map.set(day.date, slots);
    }
    return map;
  }, [availability, session]);

  // If the slot went while they were filling in details, drop them back on the
  // picker rather than leaving them staring at an error above a form they
  // cannot submit. Adjusting during render (React's documented pattern for
  // reacting to changed props) rather than in an effect, so there is no flash
  // of the dead form before the reset lands.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.slotTaken) {
      setStep(session ? "date" : "session");
      setSelectedSlot(null);
    }
  }

  if (slotsByDate.size === 0) {
    return (
      <div className="rounded-md border border-line bg-paper-raised px-6 py-14 text-center">
        <p className="font-display text-2xl">No dates open right now</p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
          The diary is either full or not published yet. Please check back
          shortly{site.contact.email ? ", or get in touch directly" : ""}.
        </p>
        {site.contact.email ? (
          <a
            href={`mailto:${site.contact.email}`}
            className="mt-6 inline-block rounded-sm bg-ink px-6 py-3 text-sm font-medium text-paper"
          >
            Email {site.artist.split(" ")[0]}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <Steps current={step} />

      {state.error ? (
        <p
          role="alert"
          className="mb-6 rounded-sm border border-ink/15 bg-ink/5 px-4 py-3 text-sm text-ink"
        >
          {state.error}
        </p>
      ) : null}

      {step === "session" ? (
        <SessionPicker
          availability={availability}
          onSelect={(choice) => {
            setSession(choice);
            setSelectedDate(null);
            setSelectedSlot(null);
            setStep("date");
          }}
        />
      ) : null}

      {step === "date" ? (
        <DatePicker
          slotsByDate={slotsByDate}
          selected={selectedDate}
          onBack={() => setStep("session")}
          onSelect={(date) => {
            setSelectedDate(date);
            // A full day has exactly one slot, so there is no time to choose.
            const daySlots = slotsByDate.get(date) ?? [];
            if (session === "full" && daySlots.length === 1) {
              setSelectedSlot(daySlots[0]);
              setStep("details");
            } else {
              setSelectedSlot(null);
              setStep("time");
            }
          }}
        />
      ) : null}

      {step === "time" && selectedDate ? (
        <TimePicker
          date={selectedDate}
          slots={slotsByDate.get(selectedDate) ?? []}
          onBack={() => setStep("date")}
          onSelect={(slot) => {
            setSelectedSlot(slot);
            setStep("details");
          }}
        />
      ) : null}

      {step === "details" && selectedSlot ? (
        <form action={formAction} className="space-y-8">
          <input type="hidden" name="startsAt" value={selectedSlot.startsAt} />
          <input type="hidden" name="endsAt" value={selectedSlot.endsAt} />
          <input type="hidden" name="session" value={selectedSlot.session} />

          <SelectedSummary
            slot={selectedSlot}
            onChange={() => {
              setStep("date");
              setSelectedSlot(null);
            }}
          />

          <DetailsFields />
          <ReferenceUpload files={files} onChange={setFiles} />

          <DepositTerms session={selectedSlot.session} />

          <SubmitButton />

          <p className="text-xs leading-relaxed text-muted">
            You&apos;ll pay securely on Stripe (card, Apple Pay or Google Pay),
            then come straight back here. Your slot is held for{" "}
            {site.paymentHoldMinutes} minutes while you pay.
          </p>
        </form>
      ) : null}
    </div>
  );
}

function Steps({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "session", label: "Session" },
    { key: "date", label: "Date" },
    { key: "time", label: "Time" },
    { key: "details", label: "Details" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === current);

  return (
    <ol className="mb-8 flex items-center gap-2 text-xs tracking-[0.1em] uppercase">
      {steps.map((step, index) => (
        <li key={step.key} className="flex flex-1 items-center gap-2">
          <span
            className={
              index <= activeIndex ? "text-ink" : "text-muted"
            }
          >
            {index + 1}. {step.label}
          </span>
          {index < steps.length - 1 ? (
            <span
              aria-hidden
              className={`h-px flex-1 ${index < activeIndex ? "bg-ink" : "bg-line"}`}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function SessionPicker({
  availability,
  onSelect,
}: {
  availability: DayAvailability[];
  onSelect: (session: SessionType) => void;
}) {
  const offered = (session: SessionType) =>
    availability.some((day) => day.slots.some((slot) => slot.session === session));

  return (
    <div>
      <p className="font-display text-2xl">How long do you need?</p>
      <p className="mt-1 mb-6 text-sm text-muted">
        Not sure? Pick a half day and mention it in your notes. Dimitar will
        let you know if the piece needs longer.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["half", "full"] as const).map((key) => {
          const option = site.sessions[key];
          const available = offered(key);
          return (
            <button
              key={key}
              type="button"
              disabled={!available}
              onClick={() => onSelect(key)}
              className="min-h-28 rounded-sm border border-line-strong px-5 py-5 text-left transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-display text-2xl">{option.label}</span>
                <span className="text-lg font-medium">{option.price}</span>
              </span>
              <span className="mt-2 block text-sm text-muted">
                {available ? option.length : "No dates free right now"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DatePicker({
  slotsByDate,
  selected,
  onBack,
  onSelect,
}: {
  slotsByDate: Map<string, Slot[]>;
  selected: string | null;
  onBack: () => void;
  onSelect: (date: string) => void;
}) {
  const openDates = useMemo(
    () => [...slotsByDate.keys()].sort(),
    [slotsByDate],
  );

  // Only offer months that contain something bookable.
  const months = useMemo(() => {
    const set = new Set(openDates.map((date) => date.slice(0, 7)));
    return [...set].sort();
  }, [openDates]);

  const [monthIndex, setMonthIndex] = useState(0);
  const month = months[monthIndex];

  const grid = useMemo(() => buildMonthGrid(month), [month]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-5 text-sm text-muted hover:text-ink"
      >
        ← Change session
      </button>
      <div className="mb-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthIndex((i) => Math.max(0, i - 1))}
          disabled={monthIndex === 0}
          className="flex h-11 w-11 items-center justify-center rounded-sm border border-line text-lg disabled:opacity-30"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="font-display text-2xl">{monthLabel(month)}</p>
        <button
          type="button"
          onClick={() => setMonthIndex((i) => Math.min(months.length - 1, i + 1))}
          disabled={monthIndex >= months.length - 1}
          className="flex h-11 w-11 items-center justify-center rounded-sm border border-line text-lg disabled:opacity-30"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="pb-2 text-center text-[11px] tracking-wider text-muted uppercase"
          >
            {label.slice(0, 1)}
            <span className="sr-only">{label}</span>
          </div>
        ))}

        {grid.map((cell, index) => {
          if (!cell) return <div key={`pad-${index}`} aria-hidden />;

          const slots = slotsByDate.get(cell.date);
          const available = Boolean(slots && slots.length > 0);
          const isSelected = selected === cell.date;

          return (
            <button
              key={cell.date}
              type="button"
              disabled={!available}
              onClick={() => onSelect(cell.date)}
              aria-label={`${cell.dayOfMonth} ${monthLabel(month)}${available ? `, ${slots?.length} slots` : ", unavailable"}`}
              className={[
                // 44px minimum touch target, per Apple/Android guidance.
                "flex aspect-square min-h-11 flex-col items-center justify-center rounded-sm border text-sm transition-colors",
                available
                  ? "border-line-strong hover:border-ink hover:bg-ink hover:text-paper"
                  : "cursor-not-allowed border-transparent text-muted/40",
                isSelected ? "border-ink bg-ink text-paper" : "",
              ].join(" ")}
            >
              <span>{cell.dayOfMonth}</span>
              {available ? (
                <span
                  aria-hidden
                  className={`mt-0.5 h-1 w-1 rounded-full ${isSelected ? "bg-paper" : "bg-ink"}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-xs text-muted">
        Dates with a dot have appointments free.
      </p>
    </div>
  );
}

function TimePicker({
  date,
  slots,
  onBack,
  onSelect,
}: {
  date: string;
  slots: Slot[];
  onBack: () => void;
  onSelect: (slot: Slot) => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-5 text-sm text-muted hover:text-ink"
      >
        ← Change date
      </button>

      <p className="font-display text-2xl">{longDateLabel(date)}</p>
      <p className="mt-1 mb-6 text-sm text-muted">
        All times shown are studio local time.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        {slots.map((slot) => (
          <button
            key={`${slot.startsAt}-${slot.endsAt}`}
            type="button"
            onClick={() => onSelect(slot)}
            className="min-h-12 rounded-sm border border-line-strong px-4 py-3 text-sm transition-colors hover:border-ink hover:bg-ink hover:text-paper"
          >
            {slot.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedSummary({
  slot,
  onChange,
}: {
  slot: Slot;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-sm border border-line bg-paper-raised px-4 py-3.5">
      <div>
        <p className="text-xs tracking-[0.1em] text-muted uppercase">
          Your appointment
        </p>
        <p className="mt-1 font-medium">
          {longDateLabel(slot.startsAt.slice(0, 10))} · {slot.label}
        </p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 text-sm text-muted underline underline-offset-4 hover:text-ink"
      >
        Change
      </button>
    </div>
  );
}

function DetailsFields() {
  return (
    <div className="space-y-5">
      <Field label="Your name" name="clientName" required autoComplete="name" />
      <Field
        label="Email"
        name="clientEmail"
        type="email"
        required
        autoComplete="email"
        hint="Your confirmation and reference code go here."
      />
      <Field
        label="Phone"
        name="clientPhone"
        type="tel"
        autoComplete="tel"
        hint="Optional, useful if anything changes on the day."
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Placement"
          name="placement"
          placeholder="e.g. inner forearm"
        />
        <SizeField />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          Anything else
        </label>
        <p className="mt-1 text-xs text-muted">
          Style, meaning, whether it&apos;s a cover-up, allergies, and
          anything else that helps with the drawing.
        </p>
        <textarea
          id="notes"
          name="notes"
          rows={5}
          className="mt-2 w-full resize-y rounded-sm border border-line-strong bg-paper-raised px-3.5 py-3 text-base outline-none focus:border-ink"
        />
      </div>
    </div>
  );
}

const SIZE_OPTIONS = ["Hand", "Patchwork", "Quarter sleeve", "Half sleeve"];

/**
 * A fixed list covers most requests; "Other" swaps in a free-text box. Only
 * one control carries the `sizeEstimate` name at a time, so the booking action
 * reads a single value either way.
 */
function SizeField() {
  const [choice, setChoice] = useState("");
  const other = choice === "other";

  return (
    <div>
      <label htmlFor="sizeChoice" className="block text-sm font-medium">
        Rough size
      </label>
      <select
        id="sizeChoice"
        name={other ? undefined : "sizeEstimate"}
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
        className="mt-2 h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-3 text-base outline-none focus:border-ink"
      >
        <option value="">Choose a size</option>
        {SIZE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="other">Other</option>
      </select>
      {other ? (
        <input
          name="sizeEstimate"
          required
          autoFocus
          aria-label="Describe the tattoo and its size"
          placeholder="What is it, and how big?"
          className="mt-2 h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-3.5 text-base outline-none focus:border-ink"
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  name,
  hint,
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {props.required ? (
          <span aria-hidden className="text-muted">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <input
        id={name}
        name={name}
        className="mt-2 h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-3.5 text-base outline-none focus:border-ink"
        {...props}
      />
    </div>
  );
}

function ReferenceUpload({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Previews are derived from the selection, not separate state. The effect
  // exists only to revoke the URLs afterwards — object URLs leak for the life
  // of the document otherwise.
  const previews = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files],
  );
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  );

  // The real <input type="file"> is what the form actually submits, so its
  // FileList is kept in sync with our state via a DataTransfer.
  useEffect(() => {
    if (!inputRef.current) return;
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    inputRef.current.files = transfer.files;
  }, [files]);

  const [processing, setProcessing] = useState(false);

  const addFiles = async (incoming: FileList | null) => {
    if (!incoming) return;
    setProcessing(true);

    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= site.uploads.maxFiles) break;
      if (!file.type.startsWith("image/")) continue;
      if (file.size > site.uploads.maxBytesPerFile) continue;
      if (next.some((f) => f.name === file.name)) continue;

      // Shrink before it ever touches the network — see image-resize.ts.
      next.push(await downscaleImage(file));
    }

    onChange(next);
    setProcessing(false);
  };

  return (
    <div>
      <p className="text-sm font-medium">Reference images</p>
      <p className="mt-1 text-xs text-muted">
        Up to {site.uploads.maxFiles} images, 10MB each. Screenshots, sketches,
        or a photo of the placement.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={`mt-3 rounded-sm border border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-ink bg-ink/5" : "border-line-strong"
        }`}
      >
        <input
          ref={inputRef}
          id="references"
          name="references"
          type="file"
          multiple
          accept="image/*"
          className="sr-only"
          onChange={(event) => addFiles(event.target.files)}
        />
        <label
          htmlFor="references"
          className="inline-block cursor-pointer rounded-sm border border-line-strong bg-paper-raised px-5 py-3 text-sm font-medium hover:border-ink"
        >
          {processing ? "Preparing…" : "Choose images"}
        </label>
        <p className="mt-3 text-xs text-muted">
          {processing ? "Resizing for a faster upload" : "or drag them here"}
        </p>
      </div>

      {files.length > 0 ? (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}`} className="relative">
              <span className="block aspect-square overflow-hidden rounded-sm bg-line">
                {previews[index] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previews[index]}
                    alt={file.name}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                aria-label={`Remove ${file.name}`}
                className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm text-paper"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DepositTerms({ session }: { session: SessionType }) {
  const price = site.sessions[session].price;
  return (
    <div className="rounded-sm border border-line bg-paper-raised p-4">
      <p className="text-sm">
        <span className="font-medium">{site.deposit.label} deposit today</span>{" "}
        to secure your slot. It comes off your {price} price, and you pay the
        rest on the day.
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          name="acceptTerms"
          value="yes"
          required
          className="mt-1 h-5 w-5 shrink-0 accent-ink"
        />
        <span>
          {TERMS_SENTENCE}{" "}
          <a href="/policy" target="_blank" className="underline underline-offset-4">
            Full policy
          </a>
        </span>
      </label>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-sm bg-ink px-6 py-4 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
    >
      {pending ? "Taking you to payment…" : `Pay ${site.deposit.label} deposit`}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Date helpers. These operate on "YYYY-MM-DD" strings that the server */
/* already resolved into studio-local dates, so no timezone maths runs */
/* in the browser — that is what kept the two views disagreeing.       */
/* ------------------------------------------------------------------ */

type Cell = { date: string; dayOfMonth: number } | null;

function buildMonthGrid(month: string): Cell[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  // Monday-first, matching UK convention.
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const leadingBlanks = (firstWeekday + 6) % 7;

  const cells: Cell[] = Array.from({ length: leadingBlanks }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: `${month}-${String(day).padStart(2, "0")}`,
      dayOfMonth: day,
    });
  }
  return cells;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function longDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
