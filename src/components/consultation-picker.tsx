"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { setConsultation, type ConsultationState } from "@/app/actions/booking";
import { CONSULTATION } from "@/lib/config";

/**
 * The optional design consultation on the client's booking page. One big tick
 * to add it, then a choice of when: at the start of the tattoo session
 * (confirmed instantly) or a separate day they request for Dim to approve.
 */
export function ConsultationPicker({
  reference,
  token,
  option,
  status,
  requestedLabel,
  latestDate,
}: {
  reference: string;
  token: string;
  option: "same_day" | "separate" | null;
  status: "confirmed" | "requested" | "approved" | null;
  /** "Tuesday 3 November, 18:00" when a separate day was requested. */
  requestedLabel: string | null;
  /** Last day a separate consultation can be (the day before the tattoo). */
  latestDate: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ConsultationState, FormData>(setConsultation, { ok: false });
  const [adding, setAdding] = useState(false);
  const [choice, setChoice] = useState<"same_day" | "separate">("same_day");

  // Close the form when a save succeeds — adjusted during render (React's
  // pattern for reacting to a new value) rather than in an effect.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setAdding(false);
  }

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const hidden = (
    <>
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="token" value={token} />
    </>
  );

  // Already chosen: show what it is and let them remove it.
  if (option && !adding) {
    const summary =
      option === "same_day"
        ? "At the start of your tattoo session."
        : status === "approved"
          ? `Confirmed for ${requestedLabel}.`
          : `You asked for ${requestedLabel}. Waiting for Dimitar to confirm, he'll be in touch if it doesn't work.`;
    return (
      <div className="rounded-md border-2 border-ink bg-paper-raised p-5">
        <p className="flex items-center gap-2 font-medium">
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-sm text-paper">✓</span>
          {CONSULTATION.label} added · {CONSULTATION.price}, paid on the day of your tattoo
        </p>
        <p className="mt-2 text-sm text-ink-soft">{summary}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <button type="button" onClick={() => setAdding(true)} className="underline underline-offset-4">
            Change
          </button>
          <form action={formAction}>
            {hidden}
            <input type="hidden" name="option" value="none" />
            <button type="submit" className="text-muted underline underline-offset-4">
              Remove it
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex w-full items-center gap-4 rounded-md border-2 border-ink bg-paper-raised p-5 text-left transition-colors hover:bg-ink hover:text-paper"
      >
        <span aria-hidden className="h-7 w-7 shrink-0 rounded-sm border-2 border-current" />
        <span>
          <span className="block font-medium">
            Add a {CONSULTATION.minutes}-minute design consultation · {CONSULTATION.price}
          </span>
          <span className="block text-sm opacity-75">
            Go through the design together before the needle. Paid on the day of your tattoo.
          </span>
        </span>
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-md border-2 border-ink bg-paper-raised p-5">
      {hidden}
      <p className="font-medium">
        {CONSULTATION.label} · {CONSULTATION.price}, paid on the day of your tattoo
      </p>
      <fieldset className="space-y-3 text-sm">
        <legend className="mb-1 text-muted">When would you like it?</legend>
        <label className="flex items-start gap-3">
          <input type="radio" name="option" value="same_day" checked={choice === "same_day"} onChange={() => setChoice("same_day")} className="mt-0.5 h-5 w-5 accent-ink" />
          <span>
            <span className="block font-medium">On my tattoo day</span>
            <span className="block text-muted">At the start of the session. Nothing else to arrange.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="radio" name="option" value="separate" checked={choice === "separate"} onChange={() => setChoice("separate")} className="mt-0.5 h-5 w-5 accent-ink" />
          <span>
            <span className="block font-medium">On a different day</span>
            <span className="block text-muted">Suggest a date and time. Dimitar will confirm, or text you another time.</span>
          </span>
        </label>
      </fieldset>

      {choice === "separate" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Date</span>
            <input type="date" name="date" required max={latestDate} className="h-12 w-full rounded-sm border border-line-strong bg-paper px-2 text-base" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Time</span>
            <input type="time" name="time" required className="h-12 w-full rounded-sm border border-line-strong bg-paper px-2 text-base" />
          </label>
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-ink">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Submit label={choice === "separate" ? "Request this time" : "Add consultation"} />
        <button type="button" onClick={() => setAdding(false)} className="h-12 px-4 text-sm text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-12 flex-1 rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50">
      {pending ? "Saving…" : label}
    </button>
  );
}
