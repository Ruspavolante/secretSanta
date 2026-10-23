"use client";

import { ActionForm } from "@/components/action-form";
import { ActionButton, SubmitButton } from "@/components/buttons";
import { Field, fileInputClasses } from "@/components/ui";
import { removeEventCover, uploadEventCover } from "@/lib/actions/events";
import { preparePhotoField } from "@/lib/image-resize";

// La copertina è più grande delle foto dei partecipanti.
const prepareCover = (formData: FormData) => preparePhotoField(formData, { required: true, maxSize: 1600 });

/** Foto centrale dell'evento, mostrata a tutti nella pagina d'iscrizione e nei link personali. */
export function CoverPanel({ eventId, eventName, coverUrl, disabled }: { eventId: string; eventName: string; coverUrl: string | null; disabled: boolean }) {
  return (
    <div className="space-y-4" data-testid="cover-panel">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt={`Copertina di ${eventName}`} className="aspect-[16/9] w-full rounded-2xl object-cover ring-1 ring-gold-200" />
      ) : (
        <p className="text-sm text-muted">Nessuna foto di copertina: i partecipanti vedranno solo il nome dell&apos;evento.</p>
      )}
      {!disabled ? (
        <>
          <ActionForm action={uploadEventCover.bind(null, eventId)} prepare={prepareCover} resetOnSuccess toastOnSuccess className="space-y-3">
            <Field label={coverUrl ? "Sostituisci la foto" : "Carica una foto"} htmlFor="cover-photo" hint="Meglio orizzontale. JPEG, PNG o WebP: viene ridimensionata automaticamente.">
              <input id="cover-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className={fileInputClasses} />
            </Field>
            <SubmitButton size="sm" pendingLabel="Caricamento…">
              <span aria-hidden="true">🖼️</span> Carica copertina
            </SubmitButton>
          </ActionForm>
          {coverUrl ? (
            <ActionButton action={removeEventCover.bind(null, eventId)} variant="danger" size="sm">
              Rimuovi copertina
            </ActionButton>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
