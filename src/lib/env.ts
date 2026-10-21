/**
 * Lettura delle variabili d'ambiente.
 * Le variabili NEXT_PUBLIC_* sono pubbliche per definizione (finiscono nel browser);
 * le credenziali SMTP sono lette solo nel codice server.
 */

export class MissingConfigError extends Error {
  constructor(variable: string) {
    super(`Variabile d'ambiente mancante: ${variable}. Controlla il file .env.local (vedi .env.example).`);
    this.name = "MissingConfigError";
  }
}

export function getSupabaseConfig() {
  // Accesso esplicito (non dinamico) perché Next.js sostituisca i valori nel bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new MissingConfigError("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new MissingConfigError("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/** URL pubblico del bucket delle foto. */
export function photoPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { url } = getSupabaseConfig();
  return `${url.replace(/\/+$/, "")}/storage/v1/object/public/photos/${path}`;
}
