import "server-only";
import type { SupabaseServerClient } from "@/lib/auth";
import { checkFeasibility, describeProblem } from "@/lib/draw/algorithm";
import { photoPublicUrl } from "@/lib/env";
import { logServerError } from "@/lib/errors";
import type { Database } from "@/lib/supabase/database.types";

/** Letture per le pagine admin. Tutte passano per RLS con la sessione dell'admin. */

export type EventStatus = Database["public"]["Enums"]["event_status"];

export class DataError extends Error {
  constructor(public readonly cause: unknown) {
    super("Errore nel caricamento dei dati");
    this.name = "DataError";
    // Nei log del server (Vercel → Logs) resta il motivo reale: codice e messaggio del database.
    logServerError("caricamento dati", cause);
  }
}

export type EventSummary = {
  id: string;
  name: string;
  status: EventStatus;
  exchangeDate: string | null;
  participantCount: number;
};

export async function listEvents(supabase: SupabaseServerClient): Promise<EventSummary[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, status, exchange_date, participants(count)")
    .order("created_at", { ascending: false });
  if (error) throw new DataError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    exchangeDate: row.exchange_date,
    participantCount: (row.participants as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

export type AdminEvent = {
  id: string;
  name: string;
  description: string | null;
  budget: string | null;
  exchangeDate: string | null;
  status: EventStatus;
  drawnAt: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  signupToken: string | null;
  signupOpen: boolean;
  coverUrl: string | null;
};

export type AdminParticipant = {
  id: string;
  name: string;
  email: string | null;
  avatar: string;
  photoUrl: string | null;
  token: string | null;
  invitedAt: string | null;
  inviteMethod: "email" | "manual" | null;
  openedAt: string | null;
  revealedAt: string | null;
};

export type ExclusionRow = { id: string; giverId: string; receiverId: string };

export type EventDetail = {
  event: AdminEvent;
  participants: AdminParticipant[];
  exclusions: ExclusionRow[];
  feasibility: { feasible: true } | { feasible: false; problems: string[] };
};

async function loadEvent(supabase: SupabaseServerClient, eventId: string): Promise<AdminEvent | null> {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, description, budget, exchange_date, status, drawn_at, published_at, closed_at, signup_token, signup_open, cover_path")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new DataError(error);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    budget: data.budget,
    exchangeDate: data.exchange_date,
    status: data.status,
    drawnAt: data.drawn_at,
    publishedAt: data.published_at,
    closedAt: data.closed_at,
    signupToken: data.signup_token,
    signupOpen: data.signup_open,
    coverUrl: photoPublicUrl(data.cover_path),
  };
}

async function loadParticipants(supabase: SupabaseServerClient, eventId: string): Promise<AdminParticipant[]> {
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, email, avatar, photo_path, invited_at, invite_method, opened_at, revealed_at, invite_tokens(token)")
    .eq("event_id", eventId)
    .order("created_at");
  if (error) throw new DataError(error);
  return (data ?? []).map((row) => {
    const tokenRow = Array.isArray(row.invite_tokens) ? row.invite_tokens[0] : row.invite_tokens;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      avatar: row.avatar,
      photoUrl: photoPublicUrl(row.photo_path),
      token: tokenRow?.token ?? null,
      invitedAt: row.invited_at,
      inviteMethod: row.invite_method === "email" || row.invite_method === "manual" ? row.invite_method : null,
      openedAt: row.opened_at,
      revealedAt: row.revealed_at,
    };
  });
}

export async function loadEventDetail(supabase: SupabaseServerClient, eventId: string): Promise<EventDetail | null> {
  const event = await loadEvent(supabase, eventId);
  if (!event) return null;

  const [participants, exclusionsResult] = await Promise.all([
    loadParticipants(supabase, eventId),
    supabase.from("exclusions").select("id, giver_id, receiver_id").eq("event_id", eventId).order("created_at"),
  ]);
  if (exclusionsResult.error) throw new DataError(exclusionsResult.error);

  const exclusions = (exclusionsResult.data ?? []).map((row) => ({
    id: row.id,
    giverId: row.giver_id,
    receiverId: row.receiver_id,
  }));

  const result = checkFeasibility({ participants, exclusions });
  return {
    event,
    participants,
    exclusions,
    feasibility: result.feasible ? { feasible: true } : { feasible: false, problems: result.problems.map(describeProblem) },
  };
}

export type AssignmentRow = {
  giver: { name: string; avatar: string; photoUrl: string | null };
  receiver: { name: string; avatar: string; photoUrl: string | null };
  revealed: boolean;
};

export async function loadAssignments(
  supabase: SupabaseServerClient,
  eventId: string,
): Promise<{ event: AdminEvent; rows: AssignmentRow[] } | null> {
  const event = await loadEvent(supabase, eventId);
  if (!event) return null;

  const [participants, assignmentsResult] = await Promise.all([
    loadParticipants(supabase, eventId),
    supabase.from("assignments").select("giver_id, receiver_id").eq("event_id", eventId),
  ]);
  if (assignmentsResult.error) throw new DataError(assignmentsResult.error);

  const byId = new Map(participants.map((p) => [p.id, p]));
  const rows = (assignmentsResult.data ?? [])
    .map((a) => ({ giver: byId.get(a.giver_id), receiver: byId.get(a.receiver_id) }))
    .filter((a): a is { giver: AdminParticipant; receiver: AdminParticipant } => Boolean(a.giver && a.receiver))
    .map(({ giver, receiver }) => ({
      giver: { name: giver.name, avatar: giver.avatar, photoUrl: giver.photoUrl },
      receiver: { name: receiver.name, avatar: receiver.avatar, photoUrl: receiver.photoUrl },
      revealed: Boolean(giver.revealedAt),
    }))
    .sort((a, b) => a.giver.name.localeCompare(b.giver.name, "it"));

  return { event, rows };
}
