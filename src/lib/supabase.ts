import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side only. The browser never talks to Supabase directly — all access
// flows through API routes authenticated by the app passcode.

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key === "PASTE_ME") {
    throw new SupabaseConfigError(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export class SupabaseConfigError extends Error {}
