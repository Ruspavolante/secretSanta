import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Client senza sessione (ruolo `anon`): può solo chiamare le funzioni
 * participant_status / participant_reveal, che richiedono il token personale.
 */
export function createSupabasePublicClient() {
  const { url, key } = getSupabaseConfig();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
