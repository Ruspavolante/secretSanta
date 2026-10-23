import "server-only";
import { randomUUID } from "node:crypto";
import { logServerError } from "@/lib/errors";
import type { createSupabasePublicClient } from "@/lib/supabase/public";
import { PHOTO_EXTENSIONS, validatePhoto } from "@/lib/validation";

type PublicClient = ReturnType<typeof createSupabasePublicClient>;

export type PhotoUpload = { ok: true; path: string | null } | { ok: false; error: string };

/**
 * Carica la foto scelta da un partecipante (pagina d'iscrizione o link personale)
 * con il ruolo anon: il database accetta solo file <evento>/<uuid>.<ext> di un
 * evento in preparazione. Nessun file selezionato = nessuna foto.
 */
export async function uploadParticipantPhotoAsAnon(supabase: PublicClient, eventId: string, file: unknown): Promise<PhotoUpload> {
  if (!(file instanceof Blob) || file.size === 0) return { ok: true, path: null };
  const photo = await validatePhoto(file);
  if (!photo.ok) return photo;

  const path = `${eventId}/${randomUUID()}.${PHOTO_EXTENSIONS[photo.type]}`;
  const { error } = await supabase.storage
    .from("photos")
    .upload(path, photo.bytes, { contentType: photo.type, upsert: false, cacheControl: "3600" });
  if (error) {
    logServerError("caricamento foto partecipante", error);
    return { ok: false, error: "Caricamento della foto non riuscito: riprova tra poco oppure procedi senza foto." };
  }
  return { ok: true, path };
}
