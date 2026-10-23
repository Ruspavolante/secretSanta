"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { requireAdminAction } from "@/lib/auth";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import { eventSchema, firstIssue, PHOTO_EXTENSIONS, uuidSchema, validatePhoto } from "@/lib/validation";

function parseEvent(formData: FormData) {
  return eventSchema.safeParse({
    name: formText(formData, "name"),
    description: formText(formData, "description"),
    budget: formText(formData, "budget"),
    exchangeDate: formText(formData, "exchangeDate"),
  });
}

export async function createEvent(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const parsed = parseEvent(formData);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { data, error } = await auth.context.supabase
    .from("events")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description,
      budget: parsed.data.budget,
      exchange_date: parsed.data.exchangeDate,
    })
    .select("id")
    .single();

  if (error || !data) {
    logServerError("createEvent", error);
    return { ok: false, error: dbErrorMessage(error) };
  }

  revalidatePath("/admin");
  redirect(`/admin/eventi/${data.id}`);
}

export async function updateEvent(
  eventId: string,
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };

  const parsed = parseEvent(formData);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { data, error } = await auth.context.supabase
    .from("events")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      budget: parsed.data.budget,
      exchange_date: parsed.data.exchangeDate,
    })
    .eq("id", eventId)
    .select("id");

  if (error) {
    logServerError("updateEvent", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (!data?.length) return { ok: false, error: "Evento non trovato." };

  revalidatePath(`/admin/eventi/${eventId}`);
  revalidatePath("/admin");
  return { ok: true, message: "Dettagli dell'evento salvati." };
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };
  const { supabase } = auth.context;

  // Tutti i file della cartella dell'evento: foto dei partecipanti, copertina e
  // foto sostituite dai partecipanti stessi (che non possono cancellarle).
  const { data: files } = await supabase.storage.from("photos").list(eventId, { limit: 1000 });

  const { data, error } = await supabase.from("events").delete().eq("id", eventId).select("id");
  if (error) {
    logServerError("deleteEvent", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (!data?.length) return { ok: false, error: "Evento non trovato." };

  const paths = (files ?? []).map((file) => `${eventId}/${file.name}`);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("photos").remove(paths);
    if (storageError) logServerError("deleteEvent: rimozione foto", storageError);
  }

  revalidatePath("/admin");
  redirect("/admin");
}

/** Foto di copertina: la vedono tutti nella pagina d'iscrizione e nei link personali. */
export async function uploadEventCover(eventId: string, _previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };
  const { supabase } = auth.context;

  const photo = await validatePhoto(formData.get("photo"));
  if (!photo.ok) return { ok: false, error: photo.error };

  const { data: event, error: findError } = await supabase.from("events").select("cover_path").eq("id", eventId).maybeSingle();
  if (findError) {
    logServerError("uploadEventCover: lettura", findError);
    return { ok: false, error: dbErrorMessage(findError) };
  }
  if (!event) return { ok: false, error: "Evento non trovato." };

  const path = `${eventId}/cover-${randomUUID()}.${PHOTO_EXTENSIONS[photo.type]}`;
  const { error: uploadError } = await supabase.storage
    .from("photos")
    .upload(path, photo.bytes, { contentType: photo.type, upsert: false, cacheControl: "3600" });
  if (uploadError) {
    logServerError("uploadEventCover: storage", uploadError);
    return { ok: false, error: "Caricamento della foto non riuscito. Riprova." };
  }

  const { error: updateError } = await supabase.from("events").update({ cover_path: path }).eq("id", eventId);
  if (updateError) {
    logServerError("uploadEventCover: aggiornamento", updateError);
    await supabase.storage.from("photos").remove([path]);
    return { ok: false, error: dbErrorMessage(updateError) };
  }
  if (event.cover_path) {
    const { error: removeError } = await supabase.storage.from("photos").remove([event.cover_path]);
    if (removeError) logServerError("uploadEventCover: rimozione vecchia foto", removeError);
  }

  revalidatePath(`/admin/eventi/${eventId}`);
  return { ok: true, message: "Foto di copertina aggiornata: la vedranno tutti aprendo i link dell'evento." };
}

export async function removeEventCover(eventId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };
  const { supabase } = auth.context;

  const { data: event, error: findError } = await supabase.from("events").select("cover_path").eq("id", eventId).maybeSingle();
  if (findError) {
    logServerError("removeEventCover: lettura", findError);
    return { ok: false, error: dbErrorMessage(findError) };
  }
  if (!event) return { ok: false, error: "Evento non trovato." };
  if (!event.cover_path) return { ok: true, message: "Nessuna foto di copertina da rimuovere." };

  const { error } = await supabase.from("events").update({ cover_path: null }).eq("id", eventId);
  if (error) {
    logServerError("removeEventCover", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  const { error: storageError } = await supabase.storage.from("photos").remove([event.cover_path]);
  if (storageError) logServerError("removeEventCover: storage", storageError);

  revalidatePath(`/admin/eventi/${eventId}`);
  return { ok: true, message: "Foto di copertina rimossa." };
}
