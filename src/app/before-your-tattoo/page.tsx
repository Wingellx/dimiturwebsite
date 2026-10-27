import type { Metadata } from "next";
import Link from "next/link";

import { instagramUrl, site, studioAddressLine, studioMapLinks } from "@/lib/config";

export const metadata: Metadata = {
  title: "Before your tattoo",
  description: `How to get ready for your appointment with ${site.artist}.`,
};

const first = site.artist.split(" ")[0];

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "The day before",
    points: [
      "Drink plenty of water. Hydrated skin takes ink better and heals faster.",
      "Get a proper night's sleep. You'll sit better and feel less of it.",
      "No alcohol for 24 hours. It thins your blood, which means more bleeding and a harder session.",
      "Keep the area out of the sun. Sunburnt or peeling skin can't be tattooed.",
      "Moisturise the area in the days leading up, but don't put lotion on it on the day.",
    ],
  },
  {
    title: "On the day",
    points: [
      "Eat a proper meal one to two hours before. Low blood sugar is the main reason people feel faint.",
      "Keep drinking water, and go easy on coffee and energy drinks.",
      "Wear loose, comfortable clothes that give easy access to the area, ideally not white.",
      "Come on your own. It's a small, private space.",
    ],
  },
  {
    title: "If something changes",
    points: [
      `If you're unwell (cold, flu, fever, or any infection or rash near the area), message ${first} before you come in. It's better for you and for the tattoo to move it.`,
      `Running late? Message ${first} as soon as you know.`,
      "Changes to your design are fine. Bring any new references with you, or send them ahead.",
    ],
  },
];

export default function BeforeYourTattooPage() {
  const maps = studioMapLinks();
  const instagram = instagramUrl();

  return (
    <div className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-medium tracking-[0.16em] text-muted uppercase">Your appointment</p>
        <h1 className="mt-4 font-display text-4xl leading-none md:text-5xl">Before your tattoo</h1>
        <p className="mt-5 text-base leading-relaxed text-ink-soft">
          A little preparation makes a big difference to how the session feels and how well the tattoo heals.
        </p>

        {SECTIONS.map((section) => (
          <section key={section.title} className="mt-10 border-t border-line pt-8">
            <h2 className="font-display text-2xl">{section.title}</h2>
            <ul className="mt-5 space-y-4 text-base leading-relaxed">
              {section.points.map((point) => (
                <li key={point} className="flex gap-3">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-10 border-t border-line pt-8">
          <h2 className="font-display text-2xl">Finding the studio</h2>
          <p className="mt-4 text-base leading-relaxed">
            {studioAddressLine()}.{" "}
            {site.studio.directions ? <span className="text-ink-soft">{site.studio.directions}.</span> : null}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={maps.google} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center rounded-sm border border-line-strong px-4 text-sm font-medium">Google Maps</a>
            <a href={maps.apple} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center rounded-sm border border-line-strong px-4 text-sm font-medium">Apple Maps</a>
            <a href={maps.waze} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center rounded-sm border border-line-strong px-4 text-sm font-medium">Waze</a>
          </div>
        </section>

        <p className="mt-10 text-sm leading-relaxed text-muted">
          Aftercare instructions are given on the day.{" "}
          {instagram ? (
            <>
              Any questions,{" "}
              <a href={instagram} target="_blank" rel="noreferrer noopener" className="text-ink underline underline-offset-4">
                message {first} on Instagram
              </a>
              .
            </>
          ) : null}
        </p>

        <Link href="/" className="mt-10 inline-block text-sm text-muted hover:text-ink">
          ← Back to {site.artist}
        </Link>
      </div>
    </div>
  );
}
