"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { approveConsultation } from "@/app/actions/admin";

export type ConsultationRequest = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string;
  requestedLabel: string;
  tattooLabel: string;
};

/**
 * Separate-day consultation requests waiting on Dim. Approve blocks the time
 * and emails the client; "Ask for another time" opens a ready-written text
 * (or email, without a phone number) from his own phone.
 */
export function ConsultationRequests({ requests }: { requests: ConsultationRequest[] }) {
  if (requests.length === 0) return null;
  return (
    <section className="mb-10 rounded-md border-2 border-ink p-4">
      <h2 className="font-display text-2xl">Consultation requests</h2>
      <ul className="mt-3 space-y-3">
        {requests.map((request) => (
          <RequestRow key={request.id} request={request} />
        ))}
      </ul>
    </section>
  );
}

function RequestRow({ request }: { request: ConsultationRequest }) {
  const [state, formAction] = useActionState(approveConsultation, { ok: false });
  const first = request.clientName.split(" ")[0];
  const message = `Hi ${first}, it's Dimitar. ${request.requestedLabel} doesn't work for the design consultation, could you do another time? `;
  const askHref = request.clientPhone
    ? `sms:${request.clientPhone.replace(/\s/g, "")}?&body=${encodeURIComponent(message)}`
    : `mailto:${request.clientEmail}?subject=${encodeURIComponent("Your design consultation")}&body=${encodeURIComponent(message)}`;

  return (
    <li className="rounded-sm border border-line bg-paper-raised p-3 text-sm">
      <p className="font-medium">
        {request.clientName} · wants <span className="underline underline-offset-2">{request.requestedLabel}</span>
      </p>
      <p className="mt-0.5 text-muted">Tattoo: {request.tattooLabel}</p>
      {state.ok ? (
        <p className="mt-3 font-medium">Approved — they&apos;ve been emailed and the time is blocked.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={formAction}>
            <input type="hidden" name="id" value={request.id} />
            <Approve />
          </form>
          <a href={askHref} className="inline-flex h-11 items-center rounded-sm border border-line-strong px-4 hover:border-ink">
            {request.clientPhone ? "Text to ask for another time" : "Email to ask for another time"}
          </a>
        </div>
      )}
      {state.error ? <p className="mt-2 text-ink">{state.error}</p> : null}
    </li>
  );
}

function Approve() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-11 rounded-sm bg-ink px-4 font-medium text-paper disabled:opacity-50">
      {pending ? "Approving…" : "Approve"}
    </button>
  );
}
