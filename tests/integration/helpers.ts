import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type Client = SupabaseClient<Database>;

export function newClient(): Client {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configura .env.local e avvia Supabase locale (npm run db:start)");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function signedIn(email: string): Promise<Client> {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email, password: "password-locale-123" });
  if (error) throw error;
  return client;
}

export const adminClient = () => signedIn("admin@example.com");
export const userClient = () => signedIn("utente@example.com");

export type Fixture = { eventId: string; ids: Record<string, string>; tokens: Record<string, string> };

/** Crea un evento con i partecipanti indicati (come admin) e ne restituisce id e token. */
export async function createFixture(admin: Client, names: string[], eventName = `Test ${crypto.randomUUID().slice(0, 8)}`): Promise<Fixture> {
  const { data: event, error } = await admin.from("events").insert({ name: eventName }).select("id").single();
  if (error) throw error;
  const { data: participants, error: pError } = await admin
    .from("participants")
    .insert(names.map((name) => ({ event_id: event.id, name })))
    .select("id, name");
  if (pError) throw pError;
  // I token sono creati da un trigger AFTER INSERT: si leggono con una query separata.
  const { data: tokenRows, error: tError } = await admin
    .from("invite_tokens")
    .select("participant_id, token")
    .in("participant_id", participants.map((p) => p.id));
  if (tError) throw tError;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  for (const p of participants) {
    ids[p.name] = p.id;
    tokens[p.name] = tokenRows.find((t) => t.participant_id === p.id)!.token;
  }
  return { eventId: event.id, ids, tokens };
}

export function pairs(fixture: Fixture, mapping: [string, string][]) {
  return mapping.map(([giver, receiver]) => ({ giver_id: fixture.ids[giver], receiver_id: fixture.ids[receiver] }));
}
