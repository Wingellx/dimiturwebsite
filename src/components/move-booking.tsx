"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

export type MoveOption = { startsAt: string; endsAt: string; label: string };

type MoveState = { ok: boolean; error?: string; slotTaken?: boolean };

/**
 * Pick a new time from a plain list (same session type only) and give a
 * reason. A native select is deliberate: it is the most reliable picker on a
 * phone, and the list is already filtered to what is genuinely free.
 */
export function MoveBooking({
  action,
  options,
  hidden,
  reasonRequired,
  buttonLabel = "Move this appointment",
}: {
  action: (prev: MoveState, formData: FormData) => Promise<MoveState>;
  options: MoveOption[];
  hidden: Record<string, string>;
  reasonRequired: boolean;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [state, formAction] = useActionState(action, { ok: false });

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-sm border border-line-strong px-4 text-sm hover:border-ink">
        {buttonLabel}
      </button>
    );
  }

  if (options.length === 0) {
    return <p className="text-sm text-muted">There are no other times free for this session right now.</p>;
  }

  const [startsAt, endsAt] = choice ? choice.split("|") : ["", ""];

  return (
    <form action={formAction} className="space-y-4 rounded-sm border border-line bg-paper-raised p-4">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />

      <label className="block text-sm">
        <span className="mb-1.5 block font-medium">New time</span>
        <select
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          required
          className="h-12 w-full rounded-sm border border-line-strong bg-paper px-3 text-base"
        >
          <option value="">Choose a new time</option>
          {options.map((option) => (
            <option key={`${option.startsAt}|${option.endsAt}`} value={`${option.startsAt}|${option.endsAt}`}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block font-medium">
          Reason{reasonRequired ? "" : " (optional)"}
        </span>
        <textarea
          name="reason"
          rows={3}
          required={reasonRequired}
          className="w-full rounded-sm border border-line-strong bg-paper px-3 py-2.5 text-base"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-ink">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Submit />
        <button type="button" onClick={() => setOpen(false)} className="h-12 rounded-sm px-4 text-sm text-muted">
          Never mind
        </button>
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-12 flex-1 rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50">
      {pending ? "Moving…" : "Confirm move"}
    </button>
  );
}
