import { logServerError } from "@/lib/errors";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * "Battito" giornaliero chiamato dal cron di Vercel (vercel.json): esegue una
 * vera query sul database così il progetto Supabase gratuito non va in pausa
 * dopo 7 giorni senza attività. Non legge né restituisce dati.
 *
 * Se su Vercel è impostata CRON_SECRET, Vercel la invia nell'header
 * Authorization e qui viene richiesta; senza, l'endpoint resta pubblico (è innocuo).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    // Token inesistente: la funzione interroga la tabella degli eventi e non restituisce nulla.
    const { error } = await createSupabasePublicClient().rpc("signup_info", { p_token: "keepalive" });
    if (error) {
      logServerError("keepalive", error);
      return Response.json({ ok: false }, { status: 503 });
    }
    return Response.json({ ok: true, at: new Date().toISOString() });
  } catch (error) {
    logServerError("keepalive", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
