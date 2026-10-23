"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { requireAdminAction } from "@/lib/auth";
import { authErrorMessage, dbErrorMessage, logServerError } from "@/lib/errors";
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
