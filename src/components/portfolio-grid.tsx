"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import type { PortfolioItem } from "@/lib/data";

export function PortfolioGrid({ items }: { items: PortfolioItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpenIndex((current) =>
        current === null ? null : (current + delta + items.length) % items.length,
      ),
    [items.length],
  );

  // Arrow keys and Escape, because a lightbox that traps you is worse than none.
  useEffect(() => {
    if (openIndex === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };

    document.addEventListener("keydown", onKey);
    // Stop the page scrolling behind the overlay on mobile.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [openIndex, close, step]);

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-strong px-6 py-16 text-center">
        <p className="font-display text-2xl">Portfolio coming soon</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          Drop photographs into <code className="text-ink">public/portfolio</code> and
          they appear here automatically, in filename order.
        </p>
      </div>
    );
  }

  const active = openIndex === null ? null : items[openIndex];

  return (
    <>
      {/* One column on a phone so each piece is actually big enough to judge. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              className="group relative block w-full overflow-hidden rounded-sm bg-line"
              aria-label={`View larger: ${item.alt}`}
            >
              <span className="block aspect-[4/5]">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {active ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={active.alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/92 p-4"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full text-2xl text-paper/80 hover:text-paper"
          >
            ×
          </button>

          {items.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous"
                onClick={(event) => {
                  event.stopPropagation();
                  step(-1);
                }}
                className="absolute left-2 z-10 flex h-12 w-12 items-center justify-center rounded-full text-3xl text-paper/70 hover:text-paper md:left-6"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={(event) => {
                  event.stopPropagation();
                  step(1);
                }}
                className="absolute right-2 z-10 flex h-12 w-12 items-center justify-center rounded-full text-3xl text-paper/70 hover:text-paper md:right-6"
              >
                ›
              </button>
            </>
          ) : null}

          <div
            className="relative h-full max-h-[85vh] w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={active.src}
              alt={active.alt}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
