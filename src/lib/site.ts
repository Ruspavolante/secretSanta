import "server-only";
import { headers } from "next/headers";

/**
 * URL base usato nei link personali. Priorità:
 * 1. NEXT_PUBLIC_SITE_URL (consigliato in produzione);
 * 2. dominio di produzione Vercel (variabile di sistema VERCEL_PROJECT_PRODUCTION_URL);
 * 3. host della richiesta corrente (sviluppo locale).
 */
export async function getBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) return `https://${vercelProduction.replace(/\/+$/, "")}`;

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${protocol}://${host}`;
}
