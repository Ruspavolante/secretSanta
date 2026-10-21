"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { requireAdminAction, type SupabaseServerClient } from "@/lib/auth";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import { firstIssue, participantSchema, PHOTO_EXTENSIONS, uuidSchema, validatePhoto } from "@/lib/validation";

function parseParticipant(formData: FormData) {
  return participantSchema.safeParse({
    name: formText(formData, "name"),
    email: formText(formData, "email"),
    avatar: formText(formData, "avatar") || "gift",
  });
}

async function findParticipant(supabase: SupabaseServerClient, participantId: string) {
  return supabase.from("participants").select("id, event_id, name, photo_path").eq("id", participantId).maybeSingle();
}

export async function addParticipant(
  eventId: string,
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };

  const parsed = parseParticipant(formData);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { error } = await auth.context.supabase.from("participants").insert({ event_id: eventId, ...parsed.data });
  if (error) {
    logServerError("addParticipant", error);
    return { ok: false, error: dbErrorMessage(error) };
  }

  revalidatePath(`/admin/eventi/${eventId}`);
  return { ok: true, message: `${parsed.data.name} è stato aggiunto ai partecipanti.` };
}

export async function updateParticipant(
  participantId: string,
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(participantId).success) return { ok: false, error: "Partecipante non valido." };

  const parsed = parseParticipant(formData);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { data, error } = await auth.context.supabase
    .from("participants")
    .update(parsed.data)
    .eq("id", participantId)
    .select("event_id");
  if (error) {
    logServerError("updateParticipant", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (!data?.length) return { ok: false, error: "Partecipante non trovato." };

  revalidatePath(`/admin/eventi/${data[0].event_id}`);
  return { ok: true, message: "Modifiche salvate." };
}

export async function deleteParticipant(participantId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(participantId).success) return { ok: false, error: "Partecipante non valido." };
  const { supabase } = auth.context;

  const { data: participant, error: findError } = await findParticipant(supabase, participantId);
  if (findError) {
    logServerError("deleteParticipant: lettura", findError);
    return { ok: false, error: dbErrorMessage(findError) };
  }
  if (!participant) return { ok: false, error: "Partecipante non trovato." };

  const { error } = await supabase.from("participants").delete().eq("id", participantId);
  if (error) {
    logServerError("deleteParticipant", error);
    return { ok: false, error: dbErrorMessage(error) };
  }

  if (participant.photo_path) {
    const { error: storageError } = await supabase.storage.from("photos").remove([participant.photo_path]);
    if (storageError) logServerError("deleteParticipant: rimozione foto", storageError);
  }

  revalidatePath(`/admin/eventi/${participant.event_id}`);
  return { ok: true, message: `${participant.name} è stato rimosso.` };
}

export async function uploadParticipantPhoto(
  participantId: string,
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(participantId).success) return { ok: false, error: "Partecipante non valido." };
  const { supabase } = auth.context;

  const photo = await validatePhoto(formData.get("photo"));
  if (!photo.ok) return { ok: false, error: photo.error };

  const { data: participant, error: findError } = await findParticipant(supabase, participantId);
  if (findError) {
    logServerError("uploadPhoto: lettura", findError);
    return { ok: false, error: dbErrorMessage(findError) };
  }
  if (!participant) return { ok: false, error: "Partecipante non trovato." };

  // Nome file casuale: l'URL pubblico non è indovinabile.
  const path = `${participant.event_id}/${randomUUID()}.${PHOTO_EXTENSIONS[photo.type]}`;
  const { error: uploadError } = await supabase.storage
    .from("photos")
    .upload(path, photo.bytes, { contentType: photo.type, upsert: false, cacheControl: "3600" });
  if (uploadError) {
    logServerError("uploadPhoto: storage", uploadError);
    return { ok: false, error: "Caricamento della foto non riuscito. Riprova." };
  }

  const { error: updateError } = await supabase.from("participants").update({ photo_path: path }).eq("id", participantId);
  if (updateError) {
    logServerError("uploadPhoto: aggiornamento", updateError);
    await supabase.storage.from("photos").remove([path]);
    return { ok: false, error: dbErrorMessage(updateError) };
  }

  if (participant.photo_path) {
    const { error: removeError } = await supabase.storage.from("photos").remove([participant.photo_path]);
    if (removeError) logServerError("uploadPhoto: rimozione vecchia foto", removeError);
  }

  revalidatePath(`/admin/eventi/${participant.event_id}`);
  return { ok: true, message: `Foto di ${participant.name} aggiornata.` };
}

export async function removeParticipantPhoto(participantId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(participantId).success) return { ok: false, error: "Partecipante non valido." };
  const { supabase } = auth.context;

  const { data: participant, error: findError } = await findParticipant(supabase, participantId);
  if (findError) {
    logServerError("removePhoto: lettura", findError);
    return { ok: false, error: dbErrorMessage(findError) };
  }
  if (!participant) return { ok: false, error: "Partecipante non trovato." };
  if (!participant.photo_path) return { ok: true, message: "Nessuna foto da rimuovere." };

  const { error } = await supabase.from("participants").update({ photo_path: null }).eq("id", participantId);
  if (error) {
    logServerError("removePhoto", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  const { error: storageError } = await supabase.storage.from("photos").remove([participant.photo_path]);
  if (storageError) logServerError("removePhoto: storage", storageError);

  revalidatePath(`/admin/eventi/${participant.event_id}`);
  return { ok: true, message: "Foto rimossa: verrà mostrata l'immagine predefinita." };
}
