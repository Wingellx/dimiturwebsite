import Link from "next/link";

import { site } from "@/lib/config";
import { getPortfolio } from "@/lib/data";
import { PortfolioGrid } from "@/components/portfolio-grid";

export default async function HomePage() {
  const portfolio = await getPortfolio();

  return (
    <>
      <section className="container-page pt-16 pb-14 md:pt-28 md:pb-24">
        <div className="max-w-3xl">
          <p className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
            {site.tagline}
          </p>
          {/* clamp() keeps the display line proportional on a 360px phone and a
              27" monitor without three separate breakpoint sizes. */}
          <h1
            className="mt-5 font-display leading-[0.95] tracking-tight text-balance"
            style={{ fontSize: "clamp(2.75rem, 9vw, 5.5rem)" }}
          >
            {site.artist}
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-ink-soft md:text-lg">
            Custom work, drawn for one person and one placement. Bring an idea,
            a reference, or nothing at all. We&apos;ll design it together
            before a needle touches skin.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/book"
              className="rounded-sm bg-ink px-6 py-3.5 text-sm font-medium text-paper transition-opacity hover:opacity-85"
            >
              Book an appointment
            </Link>
            <Link
              href="#work"
              className="rounded-sm border border-line-strong px-6 py-3.5 text-sm font-medium transition-colors hover:border-ink"
            >
              See the work
            </Link>
          </div>
        </div>
      </section>

      <section id="work" className="container-page scroll-mt-24 py-4 md:py-8">
        <div className="mb-7 flex items-end justify-between gap-6 border-b border-line pb-5">
          <h2 className="font-display text-3xl leading-none md:text-4xl">Work</h2>
          <p className="hidden text-sm text-muted sm:block">
            Tap any piece to view it larger
          </p>
        </div>
        <PortfolioGrid items={portfolio} />
      </section>

      <section id="studio" className="container-page scroll-mt-24 pt-20 md:pt-28">
        <div className="grid gap-10 border-t border-line pt-12 md:grid-cols-12 md:gap-16">
          <div className="md:col-span-4">
            <h2 className="font-display text-3xl leading-none md:text-4xl">
              The studio
            </h2>
          </div>
          <div className="space-y-5 text-base leading-relaxed text-ink-soft md:col-span-8">
            <p>
              Private, unhurried, and one client at a time. Every appointment
              starts with the design: placement, size, and how it will age on
              you, before anything is committed to skin.
            </p>
            <p>
              Send your references and notes when you book and they arrive with
              the appointment, so the drawing is already underway before you
              walk in.
            </p>
            <dl className="grid gap-6 pt-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium tracking-[0.12em] text-muted uppercase">
                  Aftercare
                </dt>
                <dd className="mt-2 text-sm">Full written guidance given on the day</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-[0.12em] text-muted uppercase">
                  Notice
                </dt>
                <dd className="mt-2 text-sm">
                  Booked at least {site.minimumNoticeHours} hours ahead
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-[0.12em] text-muted uppercase">
                  Changes
                </dt>
                <dd className="mt-2 text-sm">
                  Reschedule from your confirmation email
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="container-page pt-20 md:pt-28">
        <div className="rounded-md bg-ink px-6 py-14 text-center text-paper md:px-12 md:py-20">
          <h2 className="font-display text-3xl leading-tight text-balance md:text-5xl">
            Ready when you are
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-paper/70 md:text-base">
            Pick a time that suits you, add your references, and the slot is
            yours straight away.
          </p>
          <Link
            href="/book"
            className="mt-8 inline-block rounded-sm bg-paper px-7 py-3.5 text-sm font-medium text-ink transition-opacity hover:opacity-90"
          >
            Check available dates
          </Link>
        </div>
      </section>
    </>
  );
}
