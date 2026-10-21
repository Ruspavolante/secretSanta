"use client";

import { ActionForm } from "@/components/action-form";
import { AvatarPicker } from "@/components/admin/avatar-picker";
import { SubmitButton } from "@/components/buttons";
import { Field, inputClasses } from "@/components/ui";
import { addParticipant } from "@/lib/actions/participants";
import { LIMITS } from "@/lib/validation";

export function AddParticipantForm({ eventId }: { eventId: string }) {
  return (
    <ActionForm
      action={addParticipant.bind(null, eventId)}
      resetOnSuccess
      toastOnSuccess
      className="space-y-4 rounded-2xl bg-pine-50/60 p-4 ring-1 ring-pine-100"
      testId="add-participant-form"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="new-participant-name">
          <input
            id="new-participant-name"
            name="name"
            required
            maxLength={LIMITS.participantName}
            placeholder="Es. Mario"
            className={inputClasses}
          />
        </Field>
        <Field label="Email (facoltativa)" htmlFor="new-participant-email" hint="Serve solo per l'invio automatico dell'invito.">
          <input
            id="new-participant-email"
            name="email"
            type="email"
            maxLength={LIMITS.email}
            placeholder="mario@example.com"
            className={inputClasses}
          />
        </Field>
      </div>
      <AvatarPicker name="avatar" idPrefix="new-participant-avatar" />
      <p className="text-xs text-muted">Potrai caricare la fotografia subito dopo, dalla scheda del partecipante.</p>
      <SubmitButton variant="secondary" pendingLabel="Aggiunta…">
        <span aria-hidden="true">➕</span> Aggiungi partecipante
      </SubmitButton>
    </ActionForm>
  );
}
