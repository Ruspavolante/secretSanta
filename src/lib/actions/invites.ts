"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/result";
import { requireAdminAction, type SupabaseServerClient } from "@/lib/auth";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import { buildInviteHtml, buildInviteMessage, buildInviteSubject, buildPersonalLink } from "@/lib/invite";
import { getBaseUrl } from "@/lib/site";
import { uuidSchema } from "@/lib/validation";

export async function markInviteCopied(participantId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(participantId).success) return { ok: false, error: "Partecipante non valido." };

  const { data, error } = await auth.context.supabase
    .from("participants")
    .update({ invited_at: new Date().toISOString(), invite_method: "manual" })
    .eq("id", participantId)
    .select("event_id");
  if (error) {
    logServerError("markInviteCopied", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (!data?.length) return { ok: false, error: "Partecipante non trovato." };

  revalidatePath(`/admin/eventi/${data[0].event_id}`);
  return { ok: true };
}

export async function regenerateInviteLink(participantId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(participantId).success) return { ok: false, error: "Partecipante non valido." };
  const { supabase } = auth.context;

  const { error } = await supabase.rpc("regenerate_invite_token", { p_participant_id: participantId });
  if (error) {
    logServerError("regenerateInviteLink", error);
    return { ok: false, error: dbErrorMessage(error) };
  }

  const { data } = await supabase.from("participants").select("event_id").eq("id", participantId).maybeSingle();
  if (data) revalidatePath(`/admin/eventi/${data.event_id}`);
  return { ok: true, message: "Nuovo link creato: quello precedente non funziona più. Ricordati di inviare il nuovo invito." };
}

type Recipient = {
  id: string;
  name: string;
  email: string | null;
  token: string | null;
  event: { name: string; budget: string | null; exchange_date: string | null } | null;
};

async function loadRecipients(supabase: SupabaseServerClient, filter: { participantId?: string; eventId?: string }) {
  let query = supabase
    .from("participants")
    .select("id, name, email, invite_method, invite_tokens(token), events(name, budget, exchange_date)");
  if (filter.participantId) query = query.eq("id", filter.participantId);
  if (filter.eventId) query = query.eq("event_id", filter.eventId);
  const { data, error } = await query.order("name");
  if (error) return { error, recipients: [] as (Recipient & { invite_method: string | null })[] };

  const recipients = (data ?? []).map((row) => {
    const tokenRow = Array.isArray(row.invite_tokens) ? row.invite_tokens[0] : row.invite_tokens;
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      invite_method: row.invite_method,
      token: tokenRow?.token ?? null,
      event: event ?? null,
    };
  });
  return { error: null, recipients };
}

/** Invia a una sola persona un'email con il SUO link personale (mai il risultato). */
async function deliver(recipient: Recipient, baseUrl: string): Promise<void> {
  if (!recipient.email || !recipient.token || !recipient.event) throw new Error("Dati invito incompleti");
  const details = {
    participantName: recipient.name,
    eventName: recipient.event.name,
    link: buildPersonalLink(baseUrl, recipient.token),
    budget: recipient.event.budget,
    exchangeDate: recipient.event.exchange_date,
  };
  await sendEmail({
    to: recipient.email,
    subject: buildInviteSubject(recipient.event.name),
    text: buildInviteMessage(details),
    html: buildInviteHtml(details),
  });
}

const NOT_CONFIGURED =
  "L'invio automatico delle email non è configurato. Usa \"Copia messaggio\" e invialo tu via email o WhatsApp.";

export async function sendInviteEmail(participantId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(participantId).success) return { ok: false, error: "Partecipante non valido." };
  if (!isEmailConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const { supabase } = auth.context;

  const { error, recipients } = await loadRecipients(supabase, { participantId });
  if (error) {
    logServerError("sendInviteEmail: lettura", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  const recipient = recipients[0];
  if (!recipient) return { ok: false, error: "Partecipante non trovato." };
  if (!recipient.email) return { ok: false, error: `${recipient.name} non ha un indirizzo email: aggiungilo o usa l'invito manuale.` };

  try {
    await deliver(recipient, await getBaseUrl());
  } catch (sendError) {
    logServerError("sendInviteEmail: invio", sendError);
    return { ok: false, error: `Invio a ${recipient.name} non riuscito. Controlla la configurazione SMTP o usa l'invito manuale.` };
  }

  const { data } = await supabase
    .from("participants")
    .update({ invited_at: new Date().toISOString(), invite_method: "email" })
    .eq("id", participantId)
    .select("event_id");
  if (data?.[0]) revalidatePath(`/admin/eventi/${data[0].event_id}`);
  return { ok: true, message: `Email inviata a ${recipient.name} (${recipient.email}).` };
}

/** Invia l'email a chi ha un indirizzo e non l'ha ancora ricevuta: un messaggio separato per persona. */
export async function sendPendingInviteEmails(eventId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };
  if (!isEmailConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const { supabase } = auth.context;

  const { error, recipients } = await loadRecipients(supabase, { eventId });
  if (error) {
    logServerError("sendPendingInviteEmails: lettura", error);
    return { ok: false, error: dbErrorMessage(error) };
  }

  const pending = recipients.filter((r) => r.email && r.invite_method !== "email");
  if (pending.length === 0) return { ok: true, message: "Non ci sono email da inviare: tutti hanno già ricevuto l'invito o non hanno un indirizzo." };

  const baseUrl = await getBaseUrl();
  const sent: string[] = [];
  const failed: string[] = [];
  for (const recipient of pending) {
    try {
      await deliver(recipient, baseUrl);
      sent.push(recipient.id);
    } catch (sendError) {
      logServerError("sendPendingInviteEmails: invio", sendError);
      failed.push(recipient.name);
    }
  }

  if (sent.length) {
    await supabase
      .from("participants")
      .update({ invited_at: new Date().toISOString(), invite_method: "email" })
      .in("id", sent);
  }
  revalidatePath(`/admin/eventi/${eventId}`);

  const skipped = recipients.filter((r) => !r.email).length;
  const summary = `Email inviate: ${sent.length}.` + (skipped ? ` Senza indirizzo (usa l'invito manuale): ${skipped}.` : "");
  if (failed.length) return { ok: false, error: `${summary} Invio non riuscito per: ${failed.join(", ")}.` };
  return { ok: true, message: summary };
}
