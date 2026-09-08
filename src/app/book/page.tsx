import type { Metadata } from "next";

import { getAvailability } from "@/lib/data";
import { BookingFlow } from "@/components/booking-flow";

export const metadata: Metadata = {
  title: "Book an appointment",
  description:
    "Choose a date and time, add your reference images, and confirm your tattoo appointment.",
};

// Availability changes the moment anyone books, so this page must never be
// served from a static cache.
export const dynamic = "force-dynamic";

export default async function BookPage() {
  const availability = await getAvailability();

  return (
    <div className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10">
          <h1 className="font-display text-4xl leading-none md:text-5xl">
            Book an appointment
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-soft">
            Pick a time that works, tell me what you have in mind, and the slot
            is yours immediately — no waiting on a reply.
          </p>
        </header>

        <BookingFlow availability={availability} />
      </div>
    </div>
  );
}
