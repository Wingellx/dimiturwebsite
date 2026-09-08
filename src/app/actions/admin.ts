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

export async function saveRule(formData: FormData): Promise<void> {
  await requireAdmin();

  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const slotMinutes = Number(formData.get("slotMinutes"));

  if (!Number.isInteger(dayOfWeek) || !startTime || !endTime) return;
  if (endTime <= startTime) return;

  await adminClient().from("availability_rules").insert({
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
    slot_minutes: Number.isFinite(slotMinutes) ? slotMinutes : 180,
  });

  revalidatePath("/admin");
  revalidatePath("/book");
}

export async function deleteRule(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await adminClient().from("availability_rules").delete().eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/book");
}

export async function closeDate(formData: FormData): Promise<void> {
  await requireAdmin();

  const date = String(formData.get("date") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!date) return;

  await adminClient()
    .from("availability_exceptions")
    .upsert(
      { date, kind: "closed", note: note || null },
      { onConflict: "date,kind" },
    );

  revalidatePath("/admin");
  revalidatePath("/book");
}

export async function deleteException(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await adminClient().from("availability_exceptions").delete().eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/book");
}
