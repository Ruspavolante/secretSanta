"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { AvatarPicker } from "@/components/admin/avatar-picker";
import { SubmitButton } from "@/components/buttons";
import { Avatar, Field, fileInputClasses, inputClasses } from "@/components/ui";
import { getParticipantProfile, updateParticipantProfile, type ParticipantProfile } from "@/lib/actions/participant-view";
import { preparePhotoField } from "@/lib/image-resize";
import { LIMITS } from "@/lib/validation";

const prepareOptionalPhoto = (formData: FormData) => preparePhotoField(formData, { required: false });

/**
 * Modifica di nome, immagine e foto dal proprio link personale, finché
 * l'estrazione non è stata fatta. L'email la cambia solo l'organizzatore.
 */
export function ProfileEditor({ token, onSaved }: { token: string; onSaved: () => void }) {
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const result = await getParticipantProfile(token);
    setProfile(result.ok ? result.profile : null);
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!profile?.canEdit) return null;

  return (
    <div className="mt-6 rounded-3xl bg-snow p-4 text-ink shadow-lg sm:p-5" data-testid="profile-editor">
      <div className="flex items-center gap-3">
        <Avatar name={profile.name} avatar={profile.avatar} photoUrl={profile.photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-pine-900">I tuoi dati</p>
          <p className="text-xs text-muted">Chi ti estrarrà vedrà questo nome e questa foto.</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="rounded-full px-3 py-1.5 text-sm font-semibold text-pine-800 ring-1 ring-pine-200 hover:bg-pine-50"
        >
          {open ? "Chiudi" : "✏️ Modifica"}
        </button>
      </div>

      {open ? (
        <ActionForm
          action={(_previous, formData) => updateParticipantProfile(token, formData)}
          prepare={prepareOptionalPhoto}
          toastOnSuccess
          onSuccess={() => {
            setOpen(false);
            void load();
            onSaved();
          }}
          className="mt-4 space-y-4 border-t border-gold-100 pt-4"
          testId="profile-form"
        >
          <Field label="Nome" htmlFor="profile-name">
            <input id="profile-name" name="name" required maxLength={LIMITS.participantName} defaultValue={profile.name} className={inputClasses} />
          </Field>
          <AvatarPicker name="avatar" idPrefix="profile-avatar" defaultValue={profile.avatar} />
          <Field label="Nuova foto (facoltativa)" htmlFor="profile-photo" hint="JPEG, PNG o WebP. Viene ridimensionata automaticamente.">
            <input id="profile-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className={fileInputClasses} />
          </Field>
          {profile.photoUrl ? (
            <label className="flex items-center gap-2 text-sm text-pine-900">
              <input type="checkbox" name="removePhoto" className="size-4 accent-berry-600" /> Rimuovi la foto attuale
            </label>
          ) : null}
          <SubmitButton variant="secondary" size="sm" pendingLabel="Salvataggio…">
            Salva
          </SubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}
