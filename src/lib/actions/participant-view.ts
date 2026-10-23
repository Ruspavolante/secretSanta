"use server";

import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { photoPublicUrl } from "@/lib/env";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import { uploadParticipantPhotoAsAnon } from "@/lib/public-photos";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { firstIssue, profileSchema, tokenSchema } from "@/lib/validation";

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
  coverUrl: string | null;
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
        coverUrl: photoPublicUrl(row.event_cover_path),
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

export type ParticipantProfile = { name: string; avatar: string; photoUrl: string | null; canEdit: boolean };

/** Dati modificabili dal partecipante stesso (nome, immagine, foto). */
export async function getParticipantProfile(token: unknown): Promise<{ ok: true; profile: ParticipantProfile } | Failure> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  try {
    const { data, error } = await createSupabasePublicClient().rpc("participant_profile", { p_token: parsed.data });
    if (error) {
      logServerError("participant_profile", error);
      return UNAVAILABLE;
    }
    const row = data?.[0];
    if (!row) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      profile: {
        name: row.participant_name,
        avatar: row.participant_avatar,
        photoUrl: photoPublicUrl(row.participant_photo_path),
        canEdit: row.can_edit,
      },
    };
  } catch (error) {
    logServerError("getParticipantProfile", error);
    return UNAVAILABLE;
  }
}

/** Il partecipante aggiorna nome, immagine e foto finché l'estrazione non è stata fatta. */
export async function updateParticipantProfile(token: unknown, formData: FormData): Promise<ActionResult> {
  const parsedToken = tokenSchema.safeParse(token);
  if (!parsedToken.success) return { ok: false, error: "Link personale non valido." };

  const parsed = profileSchema.safeParse({
    name: formText(formData, "name"),
    avatar: formText(formData, "avatar") || "gift",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.rpc("participant_profile", { p_token: parsedToken.data });
    if (error) {
      logServerError("updateParticipantProfile: profilo", error);
      return { ok: false, error: dbErrorMessage(error) };
    }
    const current = data?.[0];
    if (!current) return { ok: false, error: "Link personale non valido." };
    if (!current.can_edit) return { ok: false, error: "L'estrazione è già stata fatta: i dati non si possono più modificare." };

    const removePhoto = formText(formData, "removePhoto") === "on";
    const photo = removePhoto ? ({ ok: true, path: null } as const) : await uploadParticipantPhotoAsAnon(supabase, current.event_id, formData.get("photo"));
    if (!photo.ok) return photo;

    const { error: updateError } = await supabase.rpc("participant_update_profile", {
      p_token: parsedToken.data,
      p_name: parsed.data.name,
      p_avatar: parsed.data.avatar,
      p_photo_path: photo.path ?? undefined,
      p_remove_photo: removePhoto,
    });
    if (updateError) {
      logServerError("participant_update_profile", updateError);
      const text = `${updateError.message ?? ""} ${updateError.details ?? ""}`;
      if (text.includes("participants_event_name_unique")) {
        return { ok: false, error: "C'è già un partecipante con questo nome: aggiungi l'iniziale del cognome (es. «Mario R.»)." };
      }
      return { ok: false, error: dbErrorMessage(updateError) };
    }
    return { ok: true, message: "Dati aggiornati! 🎄" };
  } catch (error) {
    logServerError("updateParticipantProfile", error);
    return { ok: false, error: "Salvataggio non riuscito: riprova tra poco." };
  }
}
