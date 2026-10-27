import Link from "next/link";
import { site, studioMapLinks } from "@/lib/config";

/**
 * Contact details are optional in config, so every block here is conditional —
 * the footer stays clean while Dimitar's studio address and handle are still
 * blank, rather than showing empty labels.
 */
export function SiteFooter() {
  const { studio, contact } = site;
  const hasStudio = studio.name || studio.addressLines.length > 0 || studio.city;
  const hasContact = contact.email || contact.phone || contact.instagram;

  return (
    <footer className="mt-24 border-t border-line md:mt-32">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 md:py-16 lg:grid-cols-3">
        <div>
          <p className="font-display text-2xl leading-none">{site.artist}</p>
          <p className="mt-3 text-sm text-muted">{site.tagline}</p>
        </div>

        {hasStudio ? (
          <div>
            <h2 className="text-xs font-medium tracking-[0.12em] text-muted uppercase">
              Studio
            </h2>
            <address className="mt-3 text-sm leading-relaxed text-ink-soft not-italic">
              {studio.name ? <span className="block">{studio.name}</span> : null}
              {studio.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="block">
                {[studio.city, studio.postcode].filter(Boolean).join(" ")}
              </span>
            </address>
            {studio.directions ? (
              <p className="mt-2 text-sm text-muted">{studio.directions}</p>
            ) : null}
            <a
              href={studioMapLinks().google}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Get directions
            </a>
          </div>
        ) : null}

        {hasContact ? (
          <div>
            <h2 className="text-xs font-medium tracking-[0.12em] text-muted uppercase">
              Contact
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
              {contact.email ? (
                <li>
                  <a className="hover:text-ink" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                </li>
              ) : null}
              {contact.phone ? (
                <li>
                  <a
                    className="hover:text-ink"
                    href={`tel:${contact.phone.replace(/\s/g, "")}`}
                  >
                    {contact.phone}
                  </a>
                </li>
              ) : null}
              {contact.instagram ? (
                <li>
                  <a
                    className="hover:text-ink"
                    href={`https://instagram.com/${contact.instagram.replace("@", "")}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {contact.instagram.startsWith("@")
                      ? contact.instagram
                      : `@${contact.instagram}`}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.artist}
          </p>
          <span className="flex gap-4">
            <Link href="/policy" className="hover:text-ink">
              Booking & deposit policy
            </Link>
            <Link href="/book" className="hover:text-ink">
              Book an appointment
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
