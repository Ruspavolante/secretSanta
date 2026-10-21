"use server";

import { photoPublicUrl } from "@/lib/env";
import { logServerError } from "@/lib/errors";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { tokenSchema } from "@/lib/validation";

/**
 * Azioni pubbliche della pagina del partecipante. Il token arriva nel corpo
 * della richiesta POST (non nell'URL) e non viene mai scritto nei log.
 */

export type EventStatus = "DRAFT" | "DRAWN" | "PUBLISHED" | "CLOSED";

export type ParticipantView = {
  participantName: string;
  eventName: string;
  eventDescription: string | null;
  eventBudget: string | null;
  eventExchangeDate: string | null;
  status: EventStatus;
  hasRevealed: boolean;
};

export type Recipient = { name: string; avatar: string; photoUrl: string | null };

type Failure = { ok: false; reason: "invalid" | "unavailable" };

const UNAVAILABLE: Failure = { ok: false, reason: "unavailable" };

export async function getParticipantView(token: unknown): Promise<{ ok: true; view: ParticipantView } | Failure> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  try {
    const { data, error } = await createSupabasePublicClient().rpc("participant_status", { p_token: parsed.data });
    if (error) {
      logServerError("participant_status", error);
      return UNAVAILABLE;
    }
    const row = data?.[0];
    if (!row) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      view: {
        participantName: row.participant_name,
        eventName: row.event_name,
        eventDescription: row.event_description ?? null,
        eventBudget: row.event_budget ?? null,
        eventExchangeDate: row.event_exchange_date ?? null,
        status: row.event_status,
        hasRevealed: row.has_revealed,
      },
    };
  } catch (error) {
    logServerError("getParticipantView", error);
    return UNAVAILABLE;
  }
}

/**
 * Restituisce il destinatario solo se l'estrazione è pubblicata: prima della
 * pubblicazione il database non restituisce alcun dato sul destinatario.
 */
export async function revealRecipient(
  token: unknown,
): Promise<{ ok: true; status: EventStatus; recipient: Recipient | null } | Failure> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  try {
    const { data, error } = await createSupabasePublicClient().rpc("participant_reveal", { p_token: parsed.data });
    if (error) {
      logServerError("participant_reveal", error);
      return UNAVAILABLE;
    }
    const row = data?.[0];
    if (!row) return { ok: false, reason: "invalid" };
    if (!row.recipient_name) return { ok: true, status: row.event_status, recipient: null };
    return {
      ok: true,
      status: row.event_status,
      recipient: {
        name: row.recipient_name,
        avatar: row.recipient_avatar,
        photoUrl: photoPublicUrl(row.recipient_photo_path),
      },
    };
  } catch (error) {
    logServerError("revealRecipient", error);
    return UNAVAILABLE;
  }
}
