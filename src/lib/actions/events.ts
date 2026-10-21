"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { requireAdminAction } from "@/lib/auth";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import { eventSchema, firstIssue, uuidSchema } from "@/lib/validation";

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

  const { data: photos } = await supabase
    .from("participants")
    .select("photo_path")
    .eq("event_id", eventId)
    .not("photo_path", "is", null);

  const { data, error } = await supabase.from("events").delete().eq("id", eventId).select("id");
  if (error) {
    logServerError("deleteEvent", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (!data?.length) return { ok: false, error: "Evento non trovato." };

  const paths = (photos ?? []).map((p) => p.photo_path).filter((p): p is string => Boolean(p));
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("photos").remove(paths);
    if (storageError) logServerError("deleteEvent: rimozione foto", storageError);
  }

  revalidatePath("/admin");
  redirect("/admin");
}
