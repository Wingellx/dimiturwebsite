"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { login } from "@/app/actions/admin";

export function LoginForm() {
  const [state, formAction] = useActionState(login, {});

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="mt-2 h-12 w-full rounded-sm border border-line-strong bg-paper-raised px-3.5 text-base outline-none focus:border-ink"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-ink">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-sm bg-ink px-6 py-3.5 text-sm font-medium text-paper disabled:opacity-50"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
