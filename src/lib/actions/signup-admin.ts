"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/result";
import { requireAdminAction } from "@/lib/auth";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation";

/** Apre o chiude il link d'iscrizione dell'evento (alla prima apertura viene creato). */
export async function setSignupOpen(eventId: string, open: boolean): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };

  const { error } = await auth.context.supabase.rpc("set_signup_open", { p_event_id: eventId, p_open: open === true });
  if (error) {
    logServerError("setSignupOpen", error);
    return { ok: false, error: dbErrorMessage(error) };
  }

  revalidatePath(`/admin/eventi/${eventId}`);
  return {
    ok: true,
    message: open
      ? "Iscrizioni aperte: condividi il link nel gruppo."
      : "Iscrizioni chiuse: il link mostra che non è più possibile iscriversi.",
  };
}

/** Sostituisce il link d'iscrizione: quello vecchio smette di funzionare. */
export async function regenerateSignupLink(eventId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };

  const { error } = await auth.context.supabase.rpc("regenerate_signup_token", { p_event_id: eventId });
  if (error) {
    logServerError("regenerateSignupLink", error);
    return { ok: false, error: dbErrorMessage(error) };
  }

  revalidatePath(`/admin/eventi/${eventId}`);
  return { ok: true, message: "Nuovo link d'iscrizione creato: quello precedente non funziona più." };
}
