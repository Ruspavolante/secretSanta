import { NextResponse, type NextRequest } from "next/server";
import { logServerError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Destinazione del link nell'email di recupero password.
 * - `token_hash` + `type=recovery` (modello email consigliato): funziona anche se
 *   l'email viene aperta su un altro dispositivo;
 * - `code` (modello email predefinito di Supabase, flusso PKCE): funziona solo nel
 *   browser in cui è stato richiesto il recupero.
 * In entrambi i casi apre una sessione e porta alla scelta della nuova password.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const code = params.get("code");

  const target = request.nextUrl.clone();
  target.search = "";

  try {
    const supabase = await createSupabaseServerClient();
    let error: unknown = new Error("Link incompleto");
    if (tokenHash && type === "recovery") {
      ({ error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash }));
    } else if (code) {
      ({ error } = await supabase.auth.exchangeCodeForSession(code));
    }

    if (!error) {
      target.pathname = "/admin/nuova-password";
      return NextResponse.redirect(target);
    }
    logServerError("conferma link di recupero", error);
  } catch (error) {
    logServerError("conferma link di recupero", error);
  }

  target.pathname = "/admin/password-dimenticata";
  target.searchParams.set("errore", "link");
  return NextResponse.redirect(target);
}
