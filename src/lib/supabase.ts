import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two clients, deliberately kept apart:
 *
 *  - `publicClient` uses the anon key and is bound by RLS. It reads
 *    availability and the portfolio, and nothing else.
 *  - `adminClient` uses the service role, bypasses RLS, and must therefore
 *    never be imported into anything that ships to the browser. It only
 *    appears inside server actions and route handlers.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function publicClient(): SupabaseClient {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );
}

export function adminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("adminClient() was called in the browser. This is a bug.");
  }
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

/** True when Supabase is configured at all — lets pages degrade instead of crash. */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
