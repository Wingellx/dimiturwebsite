import "server-only";

import { publicClient, adminClient, supabaseConfigured } from "./supabase";
import type { BookingStatus } from "./policy";
import type { BookingSession } from "./config";
import {
  buildAvailability,
  bookingHorizon,
  studioDateKey,
  type DayAvailability,
  type DayOverride,
  type RotaSettings,
  type TakenSlot,
} from "./availability";

export type PortfolioItem = {
  id: string;
  src: string;
  alt: string;
};

export type Booking = {
  id: string;
  reference: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  starts_at: string;
  ends_at: string;
  placement: string | null;
  size_estimate: string | null;
  notes: string | null;
  session_type: BookingSession;
  price_label: string | null;
  status: BookingStatus;
  created_at: string;
  cancel_token: string;
  pending_expires_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  deposit_paid_at: string | null;
  stripe_refund_id: string | null;
  refunded_at: string | null;
  refund_locked: boolean;
  cancellation_note: string | null;
};

export type BookingMove = {
  booking_id: string;
  old_starts_at: string;
  old_ends_at: string;
  new_starts_at: string;
  new_ends_at: string;
  reason: string | null;
  moved_by: "client" | "artist";
  created_at: string;
};

const BOOKING_COLUMNS =
  "id, reference, client_name, client_email, client_phone, starts_at, ends_at, placement, size_estimate, notes, session_type, status, created_at, cancel_token, pending_expires_at, stripe_checkout_session_id, stripe_payment_intent_id, deposit_paid_at, stripe_refund_id, refunded_at, refund_locked, cancellation_note, price_label";

/**
 * Availability for the whole bookable window.
 *
 * Returns an empty list rather than throwing when Supabase is not wired up yet,
 * so the site still renders during setup — the booking page shows a clear
 * "not accepting bookings yet" state instead of a stack trace.
 */
export async function getAvailability(): Promise<DayAvailability[]> {
  if (!supabaseConfigured()) return [];

  const supabase = publicClient();
  const today = studioDateKey(new Date());
  const horizon = bookingHorizon();

  const [rota, overrides, takenResult] = await Promise.all([
    getRota(),
    getDayOverrides(today, horizon),
    supabase
      .from("taken_slots")
      .select("starts_at, ends_at")
      .gte("starts_at", new Date().toISOString()),
  ]);

  if (takenResult.error) throw takenResult.error;
  // No rota row means the migration hasn't run: show "not taking bookings"
  // rather than guessing at a schedule.
  if (!rota) return [];

  return buildAvailability({
    rota,
    overrides,
    taken: (takenResult.data ?? []) as TakenSlot[],
    from: today,
    to: horizon,
  });
}

/** The single rota settings row, or null before migration 003 is applied. */
export async function getRota(): Promise<RotaSettings | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await publicClient()
    .from("rota_settings")
    .select("pattern, anchor_date, day_start, day_end")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return (data as RotaSettings) ?? null;
}

/** Dim's per-date changes between two "YYYY-MM-DD" dates, inclusive. */
export async function getDayOverrides(from: string, to: string): Promise<DayOverride[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await publicClient()
    .from("day_overrides")
    .select("date, open, start_time, end_time")
    .gte("date", from)
    .lte("date", to);
  if (error) throw error;
  return (data ?? []) as DayOverride[];
}

/**
 * Portfolio images.
 *
 * Falls back to whatever sits in /public/portfolio via the manifest, so the
 * site has real work on it the moment Dimitar's photos are dropped in a
 * folder — no database round trip needed to get started.
 */
export async function getPortfolio(): Promise<PortfolioItem[]> {
  if (supabaseConfigured()) {
    const supabase = publicClient();
    const { data, error } = await supabase
      .from("portfolio_items")
      .select("id, storage_path, static_src, alt, sort_order")
      .eq("published", true)
      .order("sort_order", { ascending: true });

    if (!error && data && data.length > 0) {
      const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/portfolio/`;
      return data.map((row) => ({
        id: row.id as string,
        src: row.storage_path
          ? `${base}${row.storage_path}`
          : (row.static_src as string),
        alt: (row.alt as string) || "Tattoo by Dimitar Penchev",
      }));
    }
  }

  const { staticPortfolio } = await import("./portfolio-manifest");
  return staticPortfolio;
}

/**
 * Admin-side: every real booking, earliest appointment first. Unpaid holds and
 * abandoned checkouts are left out — they were never appointments.
 */
export async function listBookings(): Promise<Booking[]> {
  if (!supabaseConfigured()) return [];

  const { data, error } = await adminClient()
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .in("status", ["confirmed", "cancelled", "completed"])
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Booking[];
}

/** Admin-side: signed URLs for a booking's reference images (private bucket). */
export async function getBookingImages(bookingId: string): Promise<string[]> {
  if (!supabaseConfigured()) return [];

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("booking_images")
    .select("storage_path")
    .eq("booking_id", bookingId);

  if (error || !data || data.length === 0) return [];

  const signed = await supabase.storage
    .from("references")
    .createSignedUrls(
      data.map((row) => row.storage_path as string),
      60 * 60, // an hour is plenty to look at them
    );

  if (signed.error) return [];
  return (signed.data ?? [])
    .map((entry) => entry.signedUrl)
    .filter((url): url is string => Boolean(url));
}

/** A single booking by its public reference, for the confirmation page. */
export async function getBookingByReference(
  reference: string,
): Promise<Booking | null> {
  if (!supabaseConfigured()) return null;

  const { data, error } = await adminClient()
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("reference", reference.toUpperCase())
    .maybeSingle();

  if (error) return null;
  return (data as Booking) ?? null;
}

/** Admin-side: move history per booking id, oldest first. */
export async function getBookingMoves(bookingIds: string[]): Promise<Map<string, BookingMove[]>> {
  const out = new Map<string, BookingMove[]>();
  if (!supabaseConfigured() || bookingIds.length === 0) return out;
  const { data, error } = await adminClient()
    .from("booking_moves")
    .select("booking_id, old_starts_at, old_ends_at, new_starts_at, new_ends_at, reason, moved_by, created_at")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: true });
  if (error) return out;
  for (const move of (data ?? []) as BookingMove[]) {
    out.set(move.booking_id, [...(out.get(move.booking_id) ?? []), move]);
  }
  return out;
}

/** Server-side lookup for the webhook and client actions. */
export async function getBookingById(id: string): Promise<Booking | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await adminClient().from("bookings").select(BOOKING_COLUMNS).eq("id", id).maybeSingle();
  if (error) return null;
  return (data as Booking) ?? null;
}

/** Like getBookingById, but a database error throws so the webhook returns 500 and Stripe retries. */
export async function requireBookingById(id: string): Promise<Booking | null> {
  const { data, error } = await adminClient().from("bookings").select(BOOKING_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Booking) ?? null;
}
