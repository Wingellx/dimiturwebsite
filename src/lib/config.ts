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
  /** Shown to clients when they choose; the site does not charge these. */
  sessions: Record<"half" | "full", { label: string; price: string; length: string }>;
  /** Taken by card at booking, credited against the session price. */
  deposit: { amountPence: number; currency: "gbp"; label: string };
  /** Inside this many hours the client can no longer cancel or move online. */
  changeCutoffHours: number;
  /** How long an unpaid slot is held while the client is on Stripe's page. */
  paymentHoldMinutes: number;
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
    instagram: "@dim_penchev",
  },
  sessions: {
    half: { label: "Half day", price: "£150", length: "4 hours" },
    full: { label: "Full day", price: "£250", length: "Whole day" },
  },
  /**
   * IANA zone the studio physically sits in. Every slot the client sees is a
   * wall-clock time in THIS zone, regardless of where they are browsing from,
   * which is what people actually expect from an appointment.
   */
  deposit: { amountPence: 5000, currency: "gbp", label: "£50" },
  changeCutoffHours: 72,
  paymentHoldMinutes: 30,
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

/** The deposit terms in one sentence: booking checkbox, Stripe page, policy page. */
export const TERMS_SENTENCE =
  "I understand the £50 deposit secures my slot and comes off the final price. If I cancel at least 72 hours before my appointment it's refunded minus the card processing fee (usually about £1); if I cancel later or don't attend, it's kept.";

export type BookingSession = "half" | "full" | "custom";

/** Label and price for any booking, including Dim's hand-made custom ones. */
export function sessionSummary(
  type: BookingSession,
  priceLabel?: string | null,
): { label: string; price: string } {
  if (type === "custom") return { label: "Custom session", price: priceLabel?.trim() || "" };
  return { label: site.sessions[type].label, price: site.sessions[type].price };
}

/** "Custom session (£80)", "Half day (£150)" or just the label when no price. */
export function sessionText(type: BookingSession, priceLabel?: string | null): string {
  const { label, price } = sessionSummary(type, priceLabel);
  return price ? `${label} (${price})` : label;
}

export function instagramUrl(): string | null {
  const handle = site.contact.instagram.replace("@", "").trim();
  return handle ? `https://www.instagram.com/${handle}/` : null;
}
