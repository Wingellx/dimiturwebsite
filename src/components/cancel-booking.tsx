"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { cancelBooking } from "@/app/actions/booking";

/**
 * Two-step on purpose. Cancelling is irreversible and the slot is released
 * immediately, so a single mistap should not lose someone their appointment.
 */
export function CancelBooking({
  reference,
  token,
}: {
  reference: string;
  token: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(cancelBooking, { ok: false });

  // Refresh in an effect, not during render — the server component above needs
  // to re-fetch so the page flips to its cancelled state.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-muted underline underline-offset-4 hover:text-ink"
      >
        Cancel and get my deposit back
      </button>
    );
  }

  return (
    <div className="rounded-sm border border-line bg-paper-raised p-5">
      <p className="text-sm font-medium">Cancel this appointment?</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Your £50 deposit is refunded to your card (usually 5–10 working days).
        The slot goes back into the diary straight away. This can&apos;t be
        undone.
      </p>

      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-ink">
          {state.error}
        </p>
      ) : null}

      <form action={formAction} className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="token" value={token} />
        <ConfirmButton />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-sm border border-line-strong px-5 py-2.5 text-sm hover:border-ink"
        >
          Keep it
        </button>
      </form>
    </div>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
    >
      {pending ? "Cancelling…" : "Yes, cancel it"}
    </button>
  );
}
