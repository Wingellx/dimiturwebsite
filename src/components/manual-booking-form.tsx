"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { createManualBooking, type ManualBookingState } from "@/app/actions/admin";

const input =
  "h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-3 text-base";

/**
 * Dim's "add a booking" form, for anything that isn't a standard half or full
 * day. With a deposit, the client is emailed a payment link and Dim gets the
 * same link to paste into their Instagram DM.
 */
export function ManualBookingForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ManualBookingState, FormData>(createManualBooking, { ok: false });
  const [copied, setCopied] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 w-full rounded-sm border border-dashed border-line-strong text-sm font-medium hover:border-ink sm:w-auto sm:px-6"
      >
        + Add a booking (custom time)
      </button>
    );
  }

  if (state.ok) {
    return (
      <div className="rounded-sm border border-line bg-paper-raised p-4 text-sm">
        {state.payUrl ? (
          <>
            <p className="font-medium">Held for 23 hours — waiting on the deposit (ref {state.reference}).</p>
            <p className="mt-1 text-muted">
              We&apos;ve emailed them the payment link. You can also paste it into their DM:
            </p>
            <div className="mt-3 flex gap-2">
              <input readOnly value={state.payUrl} className={`${input} font-mono text-xs`} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.payUrl ?? "");
                  setCopied(true);
                }}
                className="h-12 shrink-0 rounded-sm bg-ink px-4 text-sm font-medium text-paper"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">It turns into a normal booking the moment they pay.</p>
          </>
        ) : (
          <p className="font-medium">Booked (ref {state.reference}). They&apos;ve been emailed their confirmation.</p>
        )}
        <button type="button" onClick={() => window.location.reload()} className="mt-4 text-sm underline underline-offset-4">
          Add another
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-sm border border-line bg-paper-raised p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">Add a booking</p>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
          Close
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Date</span>
          <input type="date" name="date" required className={input} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">From</span>
          <input type="time" name="startTime" required className={input} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">To</span>
          <input type="time" name="endTime" required className={input} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Client name</span>
          <input name="clientName" required className={input} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Client email</span>
          <input type="email" name="clientEmail" required className={input} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Phone (optional)</span>
          <input type="tel" name="clientPhone" className={input} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Price (optional, e.g. £80)</span>
          <input name="priceLabel" maxLength={40} className={input} />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">What it is (placement / design)</span>
        <input name="placement" className={input} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Notes (optional)</span>
        <textarea name="notes" rows={2} className="w-full rounded-sm border border-line-strong bg-paper-raised px-3 py-2.5 text-base" />
      </label>

      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 text-muted">Deposit</legend>
        <label className="flex items-center gap-3">
          <input type="radio" name="deposit" value="link" defaultChecked className="h-5 w-5 accent-ink" />
          Send them a £50 deposit link (held 23 hours until they pay)
        </label>
        <label className="flex items-center gap-3">
          <input type="radio" name="deposit" value="none" className="h-5 w-5 accent-ink" />
          No deposit — confirm it now
        </label>
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm text-ink">
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-12 w-full rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50">
      {pending ? "Saving…" : "Add booking"}
    </button>
  );
}
