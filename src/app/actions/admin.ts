"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  passwordMatches,
  startSession,
  endSession,
  isAuthenticated,
} from "@/lib/admin-auth";
import { adminClient } from "@/lib/supabase";
import { sendCancellationNotice } from "@/lib/email";
import { getRota } from "@/lib/data";
import { planForDate, type DayOverride } from "@/lib/availability";

/** Every mutation below goes through this first. */
async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error("Not authorised.");
  }
}

export async function login(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter your password." };

  // A deliberate small delay blunts online guessing without needing a rate
  // limiter for a single-user login.
  await new Promise((resolve) => setTimeout(resolve, 400));

  try {
    if (!passwordMatches(password)) return { error: "That password isn't right." };
  } catch (error) {
    return { error: String((error as Error).message) };
  }

  await startSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

export async function artistCancelBooking(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { data } = await adminClient()
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "artist",
    })
    .eq("id", id)
    .eq("status", "confirmed")
    .select("reference, client_name, client_email, starts_at, ends_at")
    .maybeSingle();

  if (data) {
    await sendCancellationNotice({
      reference: data.reference as string,
      clientName: data.client_name as string,
      clientEmail: data.client_email as string,
      startsAt: data.starts_at as string,
      endsAt: data.ends_at as string,
      cancelledBy: "artist",
    });
  }

  revalidatePath("/admin");
  revalidatePath("/book");
}

export async function markCompleted(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await adminClient()
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", id);

  revalidatePath("/admin");
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function revalidateAvailability(): void {
  revalidatePath("/admin");
  revalidatePath("/book");
}

/**
 * Opens or closes one date, optionally with custom hours. When the result is
 * exactly what the rota would give anyway, the override is deleted instead,
 * so "reset" and "toggle back" leave no stale rows behind.
 */
export async function setDay(formData: FormData): Promise<void> {
  await requireAdmin();

  const date = String(formData.get("date") ?? "");
  const open = formData.get("open") === "true";
  const startTime = String(formData.get("startTime") ?? "").slice(0, 5);
  const endTime = String(formData.get("endTime") ?? "").slice(0, 5);
  if (!DATE_PATTERN.test(date)) return;

  const custom = open && TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime);
  if (custom && endTime <= startTime) return;

  const rota = await getRota();
  if (!rota) return;

  const override: DayOverride = {
    date,
    open,
    start_time: custom ? startTime : null,
    end_time: custom ? endTime : null,
  };
  const withOverride = planForDate(date, rota, [override]);
  const fromRota = planForDate(date, rota, []);
  const sameAsRota =
    withOverride.open === fromRota.open &&
    withOverride.halves === fromRota.halves &&
    withOverride.window?.start === fromRota.window?.start &&
    withOverride.window?.end === fromRota.window?.end;

  const table = adminClient().from("day_overrides");
  if (sameAsRota) {
    await table.delete().eq("date", date);
  } else {
    await table.upsert(override, { onConflict: "date" });
  }

  revalidateAvailability();
}

export async function resetDay(formData: FormData): Promise<void> {
  await requireAdmin();

  const date = String(formData.get("date") ?? "");
  if (!DATE_PATTERN.test(date)) return;

  await adminClient().from("day_overrides").delete().eq("date", date);
  revalidateAvailability();
}

export async function saveRota(formData: FormData): Promise<void> {
  await requireAdmin();

  const pattern = String(formData.get("pattern") ?? "").toUpperCase();
  const anchorDate = String(formData.get("anchorDate") ?? "");
  const dayStart = String(formData.get("dayStart") ?? "").slice(0, 5);
  const dayEnd = String(formData.get("dayEnd") ?? "").slice(0, 5);

  if (!/^[WO]{2,28}$/.test(pattern)) return;
  if (!DATE_PATTERN.test(anchorDate)) return;
  if (!TIME_PATTERN.test(dayStart) || !TIME_PATTERN.test(dayEnd) || dayEnd <= dayStart) return;

  await adminClient()
    .from("rota_settings")
    .upsert({
      id: 1,
      pattern,
      anchor_date: anchorDate,
      day_start: dayStart,
      day_end: dayEnd,
      updated_at: new Date().toISOString(),
    });

  revalidateAvailability();
}
