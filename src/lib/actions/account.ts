"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { isRecentRecovery, requireAdminAction } from "@/lib/auth";
import { authErrorMessage, dbErrorMessage, logServerError } from "@/lib/errors";
import { getBaseUrl } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { passwordSchema } from "@/lib/validation";

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Inserisci la password attuale.").max(200),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { message: "Le due nuove password non coincidono.", path: ["confirm"] });

/** Cambio password dell'organizzatore: serve la password attuale (sessioni lasciate aperte). */
export async function changePassword(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  const { supabase, email } = auth.context;

  const parsed = changePasswordSchema.safeParse({
    current: formText(formData, "current"),
    password: formText(formData, "password"),
    confirm: formText(formData, "confirm"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!email) return { ok: false, error: "Account senza email: impossibile verificare la password attuale." };

  const check = await supabase.auth.signInWithPassword({ email, password: parsed.data.current });
  if (check.error) {
    if (check.error.status === 400) return { ok: false, error: "La password attuale non è corretta." };
    return { ok: false, error: authErrorMessage(check.error, "cambio password: verifica") };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authErrorMessage(error, "cambio password") };
  return { ok: true, message: "Password aggiornata." };
}

/**
 * Elimina l'account e tutti i suoi eventi (partecipanti, esclusioni, abbinamenti,
 * link). Per sicurezza va digitata la propria email.
 */
export async function deleteAccount(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  const { supabase, email } = auth.context;

  const confirmation = formText(formData, "confirmation").trim().toLowerCase();
  if (!email || confirmation !== email.toLowerCase()) {
    return { ok: false, error: "Per confermare scrivi esattamente l'email del tuo account." };
  }

  // Prima i file delle foto (il database non può cancellare i file dello Storage).
  const { data: events, error: eventsError } = await supabase.from("events").select("id");
  if (eventsError) {
    logServerError("deleteAccount: eventi", eventsError);
    return { ok: false, error: dbErrorMessage(eventsError) };
  }
  for (const event of events ?? []) {
    const { data: files } = await supabase.storage.from("photos").list(event.id, { limit: 1000 });
    const paths = (files ?? []).map((file) => `${event.id}/${file.name}`);
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from("photos").remove(paths);
      if (storageError) logServerError("deleteAccount: foto", storageError);
    }
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    logServerError("deleteAccount", error);
    return { ok: false, error: dbErrorMessage(error) };
  }

  try {
    // L'utente non esiste più: basta rimuovere i cookie di sessione.
    await supabase.auth.signOut({ scope: "local" });
  } catch (signOutError) {
    unstable_rethrow(signOutError);
    logServerError("deleteAccount: logout", signOutError);
  }
  redirect("/?account=eliminato");
}

const resetRequestSchema = z.object({ email: z.email("Inserisci un indirizzo email valido.").max(254) });

/**
 * Invia (tramite Supabase Auth) l'email con il link per scegliere una nuova password.
 * La risposta è la stessa che l'account esista o no: non rivela quali email sono registrate.
 */
export async function requestPasswordReset(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse({ email: formText(formData, "email").trim().toLowerCase() });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    unstable_rethrow(error);
    logServerError("recupero password: configurazione", error);
    return { ok: false, error: "Il servizio non è configurato correttamente. Contatta chi gestisce il sito." };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await getBaseUrl()}/auth/confirm`,
  });
  if (error) {
    if (error.status === 429) return { ok: false, error: "Troppe richieste. Attendi qualche minuto e riprova." };
    logServerError("recupero password", error);
    return {
      ok: false,
      error: "Non siamo riusciti a inviare l'email di recupero. Riprova più tardi o contatta chi gestisce il sito.",
    };
  }
  return {
    ok: true,
    message: `Se esiste un account con ${parsed.data.email}, ti abbiamo inviato un'email con il link per scegliere una nuova password (controlla anche lo spam). Il link vale un'ora.`,
  };
}

const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((value) => value.password === value.confirm, { message: "Le due password non coincidono.", path: ["confirm"] });

/** Nuova password dopo aver aperto il link di recupero (senza chiedere quella vecchia). */
export async function setNewPassword(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!isRecentRecovery(auth.context)) {
    return { ok: false, error: "Il link di recupero è scaduto: richiedine uno nuovo oppure cambia la password dalla pagina Account." };
  }

  const parsed = newPasswordSchema.safeParse({ password: formText(formData, "password"), confirm: formText(formData, "confirm") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { error } = await auth.context.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authErrorMessage(error, "nuova password") };
  redirect("/admin?password=aggiornata");
}
