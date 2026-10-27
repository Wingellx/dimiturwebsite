import { site, studioAddressLine, studioMapLinks } from "@/lib/config";

/**
 * Address, map, and one-tap directions. The map is Google's keyless embed, so
 * there is no API key to manage; the buttons hand off to whichever maps app
 * the visitor actually uses.
 */
export function StudioLocation() {
  const { studio } = site;
  const links = studioMapLinks();

  return (
    <div className="grid gap-6 md:grid-cols-12 md:gap-8">
      <div className="md:col-span-5">
        <address className="text-base leading-relaxed text-ink not-italic">
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
          <p className="mt-3 text-sm text-ink-soft">{studio.directions}.</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <DirectionsLink href={links.google}>Google Maps</DirectionsLink>
          <DirectionsLink href={links.apple}>Apple Maps</DirectionsLink>
          <DirectionsLink href={links.waze}>Waze</DirectionsLink>
        </div>
      </div>

      <div className="overflow-hidden rounded-sm border border-line md:col-span-7">
        <iframe
          title={`Map: ${studioAddressLine()}`}
          src={links.embed}
          className="block h-72 w-full md:h-80"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}

function DirectionsLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex h-11 items-center rounded-sm border border-line-strong px-4 text-sm font-medium hover:border-ink"
    >
      {children}
    </a>
  );
}
