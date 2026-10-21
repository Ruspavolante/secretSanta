"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/result";
import { formText } from "@/lib/actions/result";
import { requireAdminAction } from "@/lib/auth";
import { describeProblem, drawAssignments } from "@/lib/draw/algorithm";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import { resetSchema, uuidSchema } from "@/lib/validation";

function refresh(eventId: string) {
  revalidatePath(`/admin/eventi/${eventId}`);
  revalidatePath(`/admin/eventi/${eventId}/abbinamenti`);
  revalidatePath("/admin");
}

/**
 * Calcola l'estrazione sul server e la salva in modo atomico con save_draw,
 * che rivalida tutto nel database. Se non esiste una soluzione non salva nulla.
 */
export async function runDraw(eventId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };
  const { supabase } = auth.context;

  const [eventResult, participantsResult, exclusionsResult] = await Promise.all([
    supabase.from("events").select("status").eq("id", eventId).maybeSingle(),
    supabase.from("participants").select("id, name").eq("event_id", eventId),
    supabase.from("exclusions").select("giver_id, receiver_id").eq("event_id", eventId),
  ]);
  const loadError = eventResult.error ?? participantsResult.error ?? exclusionsResult.error;
  if (loadError) {
    logServerError("runDraw: lettura", loadError);
    return { ok: false, error: dbErrorMessage(loadError) };
  }
  if (!eventResult.data) return { ok: false, error: "Evento non trovato." };
  if (!["DRAFT", "DRAWN"].includes(eventResult.data.status)) {
    return { ok: false, error: "L'estrazione è già pubblicata: per rifarla usa la procedura di annullamento." };
  }

  const result = drawAssignments({
    participants: participantsResult.data ?? [],
    exclusions: (exclusionsResult.data ?? []).map((e) => ({ giverId: e.giver_id, receiverId: e.receiver_id })),
  });
  if (!result.ok) {
    return {
      ok: false,
      error: "Nessuna estrazione valida è possibile con i partecipanti e le esclusioni attuali. Non è stato salvato nulla.",
      details: result.problems.map(describeProblem),
    };
  }

  const { error } = await supabase.rpc("save_draw", {
    p_event_id: eventId,
    p_pairs: result.pairs.map((pair) => ({ giver_id: pair.giverId, receiver_id: pair.receiverId })),
  });
  if (error) {
    logServerError("runDraw: salvataggio", error);
    return { ok: false, error: dbErrorMessage(error) };
  }

  refresh(eventId);
  return { ok: true, message: "Estrazione completata! I risultati sono ancora segreti: verificali e poi pubblicali." };
}

export async function publishDraw(eventId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };

  const { error } = await auth.context.supabase.rpc("publish_event", { p_event_id: eventId });
  if (error) {
    logServerError("publishDraw", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  refresh(eventId);
  return { ok: true, message: "Estrazione pubblicata! Ora i partecipanti possono scoprire a chi fare il regalo." };
}

export async function closeEvent(eventId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(eventId).success) return { ok: false, error: "Evento non valido." };

  const { error } = await auth.context.supabase.rpc("close_event", { p_event_id: eventId });
  if (error) {
    logServerError("closeEvent", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  refresh(eventId);
  return { ok: true, message: "Evento chiuso. Buone feste! 🎄" };
}

export async function resetDraw(
  eventId: string,
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const parsed = resetSchema.safeParse({ eventId, confirmation: formText(formData, "confirmation") });
  if (!parsed.success) return { ok: false, error: "Richiesta non valida." };

  const { error } = await auth.context.supabase.rpc("reset_draw", {
    p_event_id: parsed.data.eventId,
    p_confirmation: parsed.data.confirmation ?? "",
  });
  if (error) {
    logServerError("resetDraw", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  refresh(eventId);
  return { ok: true, message: "Estrazione annullata. L'evento è tornato in configurazione." };
}
