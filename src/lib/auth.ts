import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { logServerError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type AdminContext = { supabase: SupabaseServerClient; userId: string; email: string | null };

export type AdminStatus =
  | { status: "admin"; context: AdminContext }
  | { status: "anonymous" }
  | { status: "not_admin"; email: string | null }
  | { status: "error" };

/**
 * Verifica l'utente corrente: il JWT viene validato (getClaims) e il ruolo
 * admin viene letto dal database (is_admin), mai da dati forniti dal client.
 */
export const getAdminStatus = cache(async (): Promise<AdminStatus> => {
  let supabase: SupabaseServerClient;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    unstable_rethrow(error);
    logServerError("configurazione Supabase", error);
    return { status: "error" };
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return { status: "anonymous" };

  const userId = data.claims.sub;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;

  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");
  if (rpcError) {
    logServerError("verifica ruolo admin", rpcError);
    return { status: "error" };
  }
  if (isAdmin !== true) return { status: "not_admin", email };

  return { status: "admin", context: { supabase, userId, email } };
});

/** Per le pagine dell'area admin: reindirizza al login se l'utente non è amministratore. */
export async function requireAdminPage(): Promise<AdminContext> {
  const result = await getAdminStatus();
  switch (result.status) {
    case "admin":
      return result.context;
    case "not_admin":
      redirect("/admin/login?errore=non-autorizzato");
    case "error":
      redirect("/admin/login?errore=servizio");
    default:
      redirect("/admin/login");
  }
}

export type Unauthorized = { ok: false; error: string };

/** Per le server action: restituisce un errore invece di eseguire l'operazione. */
export async function requireAdminAction(): Promise<{ ok: true; context: AdminContext } | Unauthorized> {
  const result = await getAdminStatus();
  if (result.status === "admin") return { ok: true, context: result.context };
  if (result.status === "error") return { ok: false, error: "Servizio non disponibile. Riprova tra poco." };
  return { ok: false, error: "Sessione scaduta o permessi insufficienti. Accedi di nuovo come amministratore." };
}
