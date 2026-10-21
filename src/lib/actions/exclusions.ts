"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { requireAdminAction } from "@/lib/auth";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import { exclusionSchema, firstIssue, uuidSchema } from "@/lib/validation";

export async function addExclusion(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const parsed = exclusionSchema.safeParse({
    eventId: formText(formData, "eventId"),
    giverId: formText(formData, "giverId"),
    receiverId: formText(formData, "receiverId"),
    bothDirections: formText(formData, "bothDirections") === "on",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { eventId, giverId, receiverId, bothDirections } = parsed.data;

  const rows = [{ event_id: eventId, giver_id: giverId, receiver_id: receiverId }];
  if (bothDirections) rows.push({ event_id: eventId, giver_id: receiverId, receiver_id: giverId });

  const { data, error } = await auth.context.supabase
    .from("exclusions")
    .upsert(rows, { onConflict: "giver_id,receiver_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    logServerError("addExclusion", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (!data?.length) return { ok: false, error: "Questa esclusione esiste già." };

  revalidatePath(`/admin/eventi/${eventId}`);
  return { ok: true, message: "Esclusione aggiunta." };
}

const removeSchema = z.object({ eventId: uuidSchema, ids: z.array(uuidSchema).min(1).max(2) });

export async function removeExclusions(eventId: string, ids: string[]): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const parsed = removeSchema.safeParse({ eventId, ids });
  if (!parsed.success) return { ok: false, error: "Esclusione non valida." };

  const { data, error } = await auth.context.supabase
    .from("exclusions")
    .delete()
    .eq("event_id", parsed.data.eventId)
    .in("id", parsed.data.ids)
    .select("id");
  if (error) {
    logServerError("removeExclusions", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (!data?.length) return { ok: false, error: "Esclusione non trovata: forse è già stata rimossa." };

  revalidatePath(`/admin/eventi/${parsed.data.eventId}`);
  return { ok: true, message: "Esclusione rimossa." };
}
