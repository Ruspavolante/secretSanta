"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { logServerError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("Inserisci un indirizzo email valido.").max(254),
  password: z.string().min(1, "Inserisci la password.").max(200),
});

export async function login(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formText(formData, "email").trim().toLowerCase(),
    password: formText(formData, "password"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    unstable_rethrow(error);
    logServerError("login: configurazione", error);
    return { ok: false, error: "Il servizio non è configurato correttamente. Contatta chi gestisce il sito." };
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.status === 429) return { ok: false, error: "Troppi tentativi. Attendi qualche minuto e riprova." };
    // Nessuno stato HTTP = servizio irraggiungibile (es. progetto Supabase in pausa).
    if (!error.status || error.status >= 500) {
      logServerError("login", error);
      return { ok: false, error: "Servizio di autenticazione non disponibile. Riprova tra poco." };
    }
    return { ok: false, error: "Email o password non corretti." };
  }

  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");
  if (rpcError || isAdmin !== true) {
    if (rpcError) logServerError("login: verifica admin", rpcError);
    await supabase.auth.signOut();
    return { ok: false, error: "Questo account non è autorizzato a gestire il Secret Santa." };
  }

  redirect("/admin");
}

export async function logout(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (error) {
    unstable_rethrow(error);
    logServerError("logout", error);
  }
  redirect("/admin/login");
}
