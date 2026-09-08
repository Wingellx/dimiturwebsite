import Link from "next/link";
import { site } from "@/lib/config";

/**
 * Three destinations, so there is no hamburger — a menu button that hides two
 * links behind a tap is worse on a phone than just showing them.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4 md:h-20">
        <Link
          href="/"
          className="font-display text-xl leading-none tracking-tight md:text-2xl"
        >
          {site.artist}
        </Link>

        <nav aria-label="Main" className="flex items-center gap-5 md:gap-8">
          <Link
            href="/#work"
            className="text-sm text-ink-soft transition-colors hover:text-ink"
          >
            Work
          </Link>
          <Link
            href="/#studio"
            className="hidden text-sm text-ink-soft transition-colors hover:text-ink sm:block"
          >
            Studio
          </Link>
          <Link
            href="/book"
            className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85 md:px-5"
          >
            Book
          </Link>
        </nav>
      </div>
    </header>
  );
}
