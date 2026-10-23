"use server";

import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { photoPublicUrl } from "@/lib/env";
import { dbErrorMessage, logServerError, type DbError } from "@/lib/errors";
import { buildInviteHtml, buildInviteMessage, buildInviteSubject, buildPersonalLink } from "@/lib/invite";
import { uploadParticipantPhotoAsAnon } from "@/lib/public-photos";
import { getBaseUrl } from "@/lib/site";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { firstIssue, signupSchema, tokenSchema } from "@/lib/validation";

/**
 * Azioni pubbliche della pagina d'iscrizione (/iscrizione#token). Il token del
 * link di gruppo arriva nel corpo della richiesta e non viene mai scritto nei log.
 * Chi lo possiede può solo iscriversi: non vede gli altri partecipanti.
 */

export type SignupEvent = {
  eventName: string;
  eventDescription: string | null;
  eventBudget: string | null;
  eventExchangeDate: string | null;
  coverUrl: string | null;
  isOpen: boolean;
};

type Failure = { ok: false; reason: "invalid" | "unavailable" };

export async function getSignupInfo(token: unknown): Promise<{ ok: true; event: SignupEvent } | Failure> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  try {
    const { data, error } = await createSupabasePublicClient().rpc("signup_info", { p_token: parsed.data });
    if (error) {
      logServerError("signup_info", error);
      return { ok: false, reason: "unavailable" };
    }
    const row = data?.[0];
    if (!row) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      event: {
        eventName: row.event_name,
        eventDescription: row.event_description ?? null,
        eventBudget: row.event_budget ?? null,
        eventExchangeDate: row.event_exchange_date ?? null,
        coverUrl: photoPublicUrl(row.event_cover_path),
        isOpen: row.is_open,
      },
    };
  } catch (error) {
    logServerError("getSignupInfo", error);
    return { ok: false, reason: "unavailable" };
  }
}

export type SignupResult =
  | { ok: true; participantName: string; personalLink: string; email: string; emailSent: boolean }
  | Extract<ActionResult, { ok: false }>;

function signupErrorMessage(error: DbError): string {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (text.includes("participants_event_email_unique")) {
    return "Questa email è già iscritta. Se hai perso il tuo link personale chiedilo all'organizzatore.";
  }
  if (text.includes("participants_event_name_unique")) {
    return "C'è già un partecipante con questo nome: aggiungi l'iniziale del cognome (es. «Mario R.»).";
  }
  return dbErrorMessage(error);
}

export async function registerParticipant(token: unknown, formData: FormData): Promise<SignupResult> {
  const parsedToken = tokenSchema.safeParse(token);
  if (!parsedToken.success) return { ok: false, error: dbErrorMessage({ message: "SS_SIGNUP_INVALID" }) };

  const parsed = signupSchema.safeParse({
    name: formText(formData, "name"),
    email: formText(formData, "email"),
    avatar: formText(formData, "avatar") || "gift",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { name, email, avatar } = parsed.data;

  try {
    const supabase = createSupabasePublicClient();
    const info = await supabase.rpc("signup_info", { p_token: parsedToken.data });
    if (info.error) {
      logServerError("registerParticipant: signup_info", info.error);
      return { ok: false, error: dbErrorMessage(info.error) };
    }
    const event = info.data?.[0];
    if (!event) return { ok: false, error: dbErrorMessage({ message: "SS_SIGNUP_INVALID" }) };
    if (!event.is_open) return { ok: false, error: dbErrorMessage({ message: "SS_SIGNUP_CLOSED" }) };

    const photo = await uploadParticipantPhotoAsAnon(supabase, event.event_id, formData.get("photo"));
    if (!photo.ok) return photo;

    const { data: personalToken, error } = await supabase.rpc("register_participant", {
      p_token: parsedToken.data,
      p_name: name,
      p_email: email,
      p_avatar: avatar,
      p_photo_path: photo.path ?? undefined,
    });
    if (error || !personalToken) {
      if (error) logServerError("register_participant", error);
      return { ok: false, error: signupErrorMessage(error) };
    }

    const personalLink = buildPersonalLink(await getBaseUrl(), personalToken);
    let emailSent = false;
    if (isEmailConfigured()) {
      const details = {
        participantName: name,
        eventName: event.event_name,
        link: personalLink,
        budget: event.event_budget,
        exchangeDate: event.event_exchange_date,
      };
      try {
        await sendEmail({
          to: email,
          subject: buildInviteSubject(event.event_name),
          text: buildInviteMessage(details),
          html: buildInviteHtml(details),
        });
        emailSent = true;
        const marked = await supabase.rpc("participant_mark_emailed", { p_token: personalToken });
        if (marked.error) logServerError("participant_mark_emailed", marked.error);
      } catch (sendError) {
        logServerError("registerParticipant: invio email", sendError);
      }
    }

    return { ok: true, participantName: name, personalLink, email, emailSent };
  } catch (error) {
    logServerError("registerParticipant", error);
    return { ok: false, error: "Iscrizione non riuscita: riprova tra poco." };
  }
}
