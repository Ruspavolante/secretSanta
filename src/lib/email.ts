import "server-only";
import nodemailer from "nodemailer";

/**
 * Invio automatico delle email d'invito via SMTP (opzionale).
 * Funziona con qualsiasi SMTP gratuito (es. Gmail con password per app, Brevo).
 * Se le variabili non sono impostate l'invio automatico è semplicemente disattivato
 * e resta disponibile l'invito manuale.
 */

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
};

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!host || !from || !Number.isInteger(port) || port <= 0) return null;
  const user = process.env.SMTP_USER?.trim() || null;
  const password = process.env.SMTP_PASSWORD || null;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return { host, port, secure, user, password, from };
}

export function isEmailConfigured(): boolean {
  return getSmtpConfig() !== null;
}

export type OutgoingEmail = { to: string; subject: string; text: string; html: string };

export async function sendEmail(message: OutgoingEmail): Promise<void> {
  const config = getSmtpConfig();
  if (!config) throw new Error("SMTP non configurato");

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  await transport.sendMail({ from: config.from, ...message });
}
