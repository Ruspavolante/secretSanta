import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Client Supabase legato alla sessione dell'utente (cookie). Le query sono
 * soggette a RLS: un utente non amministratore non legge né modifica nulla.
 */
export async function createSupabaseServerClient() {
  const { url, key } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Chiamato da un Server Component: i cookie li aggiorna il proxy.
        }
      },
    },
  });
}
