/**
 * Everything Dimitar might want changed without touching a component.
 * Edit here, not in the pages.
 */

type SiteConfig = {
  artist: string;
  tagline: string;
  studio: {
    name: string;
    addressLines: string[];
    city: string;
    postcode: string;
    /** How to find the door once you're there. */
    directions: string;
  };
  contact: { email: string; phone: string; instagram: string };
  timezone: string;
  bookingWindowDays: number;
  minimumNoticeHours: number;
  uploads: {
    maxFiles: number;
    maxBytesPerFile: number;
    acceptedMimeTypes: string[];
  };
};

export const site: SiteConfig = {
  artist: "Dimitar Penchev",
  tagline: "Tattooist · Lincoln",
  /** Shown in the footer and on the confirmation email. */
  studio: {
    name: "",
    addressLines: ["2 Fulbeck House", "Turner Avenue"],
    city: "Lincoln",
    postcode: "LN6 7NQ",
    directions: "Inside the hair & beauty salon",
  },
  contact: {
    email: "",
    phone: "",
    instagram: "",
  },
  /**
   * IANA zone the studio physically sits in. Every slot the client sees is a
   * wall-clock time in THIS zone, regardless of where they are browsing from,
   * which is what people actually expect from an appointment.
   */
  timezone: "Europe/London",
  /** How far ahead a client may book. */
  bookingWindowDays: 90,
  /** Minimum notice. Stops someone booking a 4h session starting in 20 minutes. */
  minimumNoticeHours: 24,
  /** Per-booking upload limits, mirrored by the storage bucket config. */
  uploads: {
    maxFiles: 6,
    maxBytesPerFile: 10 * 1024 * 1024,
    acceptedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ],
  },
};

/** Where confirmation emails come from. Falls back to Resend's sandbox sender. */
export const emailFrom =
  process.env.BOOKING_EMAIL_FROM ?? "onboarding@resend.dev";

/** Absolute base URL, needed for links inside emails. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** The studio address as one line, for map searches and directions links. */
export function studioAddressLine(): string {
  const { name, addressLines, city, postcode } = site.studio;
  return [name, ...addressLines, city, postcode].filter(Boolean).join(", ");
}

/**
 * Directions links that open the right app on a phone. Each searches the
 * address text rather than fixed coordinates, so a corrected address in
 * `site.studio` fixes every link at once.
 */
export function studioMapLinks(): {
  google: string;
  apple: string;
  waze: string;
  embed: string;
} {
  const q = encodeURIComponent(studioAddressLine());
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    embed: `https://maps.google.com/maps?q=${q}&z=16&output=embed`,
  };
}
