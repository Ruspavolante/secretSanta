import { z } from "zod";
import { AVATAR_KEYS } from "@/lib/avatars";

/**
 * Regole di validazione condivise da client (attributi dei campi) e server (zod).
 * Gli stessi limiti sono imposti anche dai vincoli CHECK del database.
 */
export const LIMITS = {
  eventName: 80,
  eventDescription: 500,
  eventBudget: 40,
  participantName: 60,
  email: 254,
  photoBytes: 2 * 1024 * 1024,
  passwordMin: 8,
  // Supabase Auth (bcrypt) considera al massimo 72 byte.
  passwordMax: 72,
} as const;

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const optionalText = (max: number, label: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(max, `${label}: massimo ${max} caratteri.`))
    .transform((value) => (value === "" ? null : value));

export const uuidSchema = z.uuid("Identificativo non valido.");

export const tokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Link personale non valido.");

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `La password deve avere almeno ${LIMITS.passwordMin} caratteri.`)
  .max(LIMITS.passwordMax, `La password può avere al massimo ${LIMITS.passwordMax} caratteri.`);

export const eventSchema = z.object({
  name: z
    .string()
    .transform(collapseSpaces)
    .pipe(
      z
        .string()
        .min(1, "Inserisci il nome dell'evento.")
        .max(LIMITS.eventName, `Il nome può avere al massimo ${LIMITS.eventName} caratteri.`),
    ),
  description: optionalText(LIMITS.eventDescription, "Descrizione"),
  budget: optionalText(LIMITS.eventBudget, "Budget"),
  exchangeDate: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidIsoDate(value), "Data non valida.")
    .transform((value) => (value === "" ? null : value)),
});

export type EventInput = z.output<typeof eventSchema>;

export const participantSchema = z.object({
  name: z
    .string()
    .transform(collapseSpaces)
    .pipe(
      z
        .string()
        .min(1, "Inserisci il nome.")
        .max(LIMITS.participantName, `Il nome può avere al massimo ${LIMITS.participantName} caratteri.`),
    ),
  email: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(
      z.union([
        z.literal(""),
        z.email("Indirizzo email non valido.").max(LIMITS.email, "Indirizzo email troppo lungo."),
      ]),
    )
    .transform((value) => (value === "" ? null : value)),
  avatar: z.enum(AVATAR_KEYS, "Immagine predefinita non valida."),
});

export type ParticipantInput = z.output<typeof participantSchema>;

/** Iscrizione dal link di gruppo: l'email è obbligatoria (serve per ricevere il link personale). */
export const signupSchema = participantSchema.extend({
  email: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(
      z
        .email("Inserisci un indirizzo email valido: lì riceverai il tuo link personale.")
        .max(LIMITS.email, "Indirizzo email troppo lungo."),
    ),
});

/** Dati che il partecipante può modificare da solo dal proprio link (l'email no). */
export const profileSchema = participantSchema.pick({ name: true, avatar: true });

export const exclusionSchema = z
  .object({
    eventId: uuidSchema,
    giverId: uuidSchema,
    receiverId: uuidSchema,
    bothDirections: z.boolean(),
  })
  .refine((value) => value.giverId !== value.receiverId, {
    message: "Scegli due persone diverse.",
    path: ["receiverId"],
  });

export const resetSchema = z.object({
  eventId: uuidSchema,
  confirmation: z.string().max(LIMITS.eventName + 20).optional(),
});

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Riconosce il formato reale del file dai primi byte (non ci si fida del MIME dichiarato). */
export function detectImageType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte)
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const PHOTO_EXTENSIONS: Record<PhotoType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PhotoCheck = { ok: true; type: PhotoType; bytes: Uint8Array } | { ok: false; error: string };

export async function validatePhoto(file: unknown): Promise<PhotoCheck> {
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "Seleziona una fotografia." };
  if (file.size > LIMITS.photoBytes) return { ok: false, error: "La fotografia supera i 2 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "Formato non supportato: usa JPEG, PNG o WebP." };
  return { ok: true, type, bytes };
}

/** Primo messaggio d'errore di una validazione zod, adatto all'utente. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dati non validi.";
}
