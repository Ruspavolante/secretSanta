"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { AvatarPicker } from "@/components/admin/avatar-picker";
import { ActionButton, CopyButton, SubmitButton } from "@/components/buttons";
import { Avatar, buttonClasses, Chip, cx, Field, inputClasses } from "@/components/ui";
import { markInviteCopied, regenerateInviteLink, sendInviteEmail } from "@/lib/actions/invites";
import {
  deleteParticipant,
  removeParticipantPhoto,
  updateParticipant,
  uploadParticipantPhoto,
} from "@/lib/actions/participants";
import type { AdminParticipant } from "@/lib/data";
import { resizeImage } from "@/lib/image-resize";
import { buildInviteMessage, buildInviteSubject, buildMailtoUrl, buildPersonalLink, buildWhatsAppUrl } from "@/lib/invite";
import { LIMITS } from "@/lib/validation";

type EventInfo = { id: string; name: string; budget: string | null; exchangeDate: string | null };

export function ParticipantCard({
  participant,
  event,
  baseUrl,
  emailEnabled,
  canDelete,
  canEdit,
}: {
  participant: AdminParticipant;
  event: EventInfo;
  baseUrl: string;
  emailEnabled: boolean;
  canDelete: boolean;
  canEdit: boolean;
}) {
  const [panel, setPanel] = useState<"invite" | "edit" | null>(null);
  const toggle = (next: "invite" | "edit") => setPanel((current) => (current === next ? null : next));
  const panelId = `participant-${participant.id}-panel`;

  return (
    <li className="rounded-2xl border border-gold-200 bg-white shadow-sm" data-testid="participant-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={participant.name} avatar={participant.avatar} photoUrl={participant.photoUrl} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-pine-900">{participant.name}</p>
            <p className="truncate text-sm text-muted">{participant.email ?? "Nessuna email"}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <ParticipantChips participant={participant} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            aria-expanded={panel === "invite"}
            aria-controls={panelId}
            onClick={() => toggle("invite")}
            className={buttonClasses(panel === "invite" ? "secondary" : "ghost", "sm")}
          >
            <span aria-hidden="true">✉️</span> Invito
          </button>
          {canEdit ? (
            <button
              type="button"
              aria-expanded={panel === "edit"}
              aria-controls={panelId}
              onClick={() => toggle("edit")}
              className={buttonClasses(panel === "edit" ? "secondary" : "ghost", "sm")}
            >
              <span aria-hidden="true">✏️</span> Modifica
            </button>
          ) : null}
          {canDelete ? (
            <ActionButton
              action={deleteParticipant.bind(null, participant.id)}
              variant="danger"
              size="sm"
              confirm={{
                title: `Eliminare ${participant.name}?`,
                body: "Verranno rimosse anche le sue esclusioni e la sua foto. L'operazione non si può annullare.",
                confirmLabel: "Elimina",
                tone: "danger",
              }}
            >
              <span aria-hidden="true">🗑️</span> Elimina
            </ActionButton>
          ) : null}
        </div>
      </div>

      {panel ? (
        <div id={panelId} className="border-t border-gold-100 bg-cream/60 p-4">
          {panel === "invite" ? (
            <InvitePanel participant={participant} event={event} baseUrl={baseUrl} emailEnabled={emailEnabled} />
          ) : (
            <EditPanel participant={participant} />
          )}
        </div>
      ) : null}
    </li>
  );
}

function ParticipantChips({ participant }: { participant: AdminParticipant }) {
  return (
    <>
      {participant.inviteMethod === "email" ? (
        <Chip tone="good">📧 Email inviata</Chip>
      ) : participant.inviteMethod === "manual" ? (
        <Chip tone="info">📋 Invito copiato</Chip>
      ) : (
        <Chip tone="warn">⏳ Invito da inviare</Chip>
      )}
      {participant.openedAt ? <Chip tone="good">👀 Link aperto</Chip> : null}
      {participant.revealedAt ? <Chip tone="good">🎁 Ha scoperto il destinatario</Chip> : null}
    </>
  );
}

function InvitePanel({
  participant,
  event,
  baseUrl,
  emailEnabled,
}: {
  participant: AdminParticipant;
  event: EventInfo;
  baseUrl: string;
  emailEnabled: boolean;
}) {
  if (!participant.token) {
    return <p className="text-sm text-berry-700">Link personale non disponibile: ricarica la pagina.</p>;
  }
  const link = buildPersonalLink(baseUrl, participant.token);
  const message = buildInviteMessage({
    participantName: participant.name,
    eventName: event.name,
    link,
    budget: event.budget,
    exchangeDate: event.exchangeDate,
  });
  const subject = buildInviteSubject(event.name);
  const markCopied = () => {
    void markInviteCopied(participant.id);
  };

  return (
    <div className="space-y-4">
      <Field label={`Link personale di ${participant.name}`} htmlFor={`link-${participant.id}`} hint="Chi possiede questo link può vedere il risultato di questa persona: invialo solo a lei.">
        <input id={`link-${participant.id}`} readOnly value={link} className={cx(inputClasses, "font-mono text-xs")} onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <Field label="Messaggio d'invito" htmlFor={`message-${participant.id}`}>
        <textarea id={`message-${participant.id}`} readOnly value={message} rows={6} className={cx(inputClasses, "text-sm")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={message} label="Copia messaggio" copiedMessage="Messaggio copiato: incollalo in email o WhatsApp." variant="secondary" onCopied={markCopied} />
        <CopyButton text={link} label="Copia solo il link" copiedMessage="Link copiato negli appunti." onCopied={markCopied} />
        <a href={buildWhatsAppUrl(message)} target="_blank" rel="noopener noreferrer" onClick={markCopied} className={buttonClasses("ghost", "sm")}>
          <span aria-hidden="true">💬</span> Apri WhatsApp
        </a>
        <a href={buildMailtoUrl(participant.email, subject, message)} onClick={markCopied} className={buttonClasses("ghost", "sm")}>
          <span aria-hidden="true">📧</span> Apri app email
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-gold-100 pt-4">
        {emailEnabled ? (
          participant.email ? (
            <ActionButton action={sendInviteEmail.bind(null, participant.id)} size="sm" pendingLabel="Invio…">
              <span aria-hidden="true">🚀</span> Invia email automatica
            </ActionButton>
          ) : (
            <p className="text-xs text-muted">Aggiungi un&apos;email per usare l&apos;invio automatico.</p>
          )
        ) : (
          <p className="text-xs text-muted">Invio automatico non configurato: usa i pulsanti qui sopra.</p>
        )}
        <ActionButton
          action={regenerateInviteLink.bind(null, participant.id)}
          variant="danger"
          size="sm"
          className="sm:ml-auto"
          confirm={{
            title: "Creare un nuovo link?",
            body: `Il link attuale di ${participant.name} smetterà di funzionare. Usalo se il link è finito nelle mani sbagliate, poi invia il nuovo invito.`,
            confirmLabel: "Crea nuovo link",
            tone: "danger",
          }}
        >
          <span aria-hidden="true">🔄</span> Rigenera link
        </ActionButton>
      </div>
    </div>
  );
}

async function preparePhoto(formData: FormData): Promise<FormData | string> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return "Seleziona una fotografia.";
  if (!file.type.startsWith("image/")) return "Il file selezionato non è un'immagine.";
  try {
    const resized = await resizeImage(file);
    if (resized.size > LIMITS.photoBytes) return "La fotografia è troppo grande anche dopo il ridimensionamento.";
    const prepared = new FormData();
    prepared.set("photo", resized, "foto.jpg");
    return prepared;
  } catch {
    return "Impossibile leggere questa immagine: prova con un file JPEG o PNG.";
  }
}

function EditPanel({ participant }: { participant: AdminParticipant }) {
  const prefix = `edit-${participant.id}`;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ActionForm action={updateParticipant.bind(null, participant.id)} toastOnSuccess className="space-y-4">
        <Field label="Nome" htmlFor={`${prefix}-name`}>
          <input id={`${prefix}-name`} name="name" required maxLength={LIMITS.participantName} defaultValue={participant.name} className={inputClasses} />
        </Field>
        <Field label="Email (facoltativa)" htmlFor={`${prefix}-email`}>
          <input id={`${prefix}-email`} name="email" type="email" maxLength={LIMITS.email} defaultValue={participant.email ?? ""} className={inputClasses} />
        </Field>
        <AvatarPicker name="avatar" idPrefix={`${prefix}-avatar`} defaultValue={participant.avatar} />
        <SubmitButton variant="secondary" size="sm" pendingLabel="Salvataggio…">
          Salva modifiche
        </SubmitButton>
      </ActionForm>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-pine-900">Fotografia</p>
        <div className="flex items-center gap-4">
          <Avatar name={participant.name} avatar={participant.avatar} photoUrl={participant.photoUrl} size="lg" />
          {participant.photoUrl ? (
            <ActionButton action={removeParticipantPhoto.bind(null, participant.id)} variant="danger" size="sm">
              Rimuovi foto
            </ActionButton>
          ) : (
            <p className="text-sm text-muted">Nessuna foto: viene mostrata l&apos;immagine predefinita.</p>
          )}
        </div>
        <ActionForm action={uploadParticipantPhoto.bind(null, participant.id)} prepare={preparePhoto} resetOnSuccess toastOnSuccess className="space-y-3">
          <Field label="Carica una nuova foto" htmlFor={`${prefix}-photo`} hint="JPEG, PNG o WebP. Viene ridimensionata automaticamente.">
            <input
              id={`${prefix}-photo`}
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-pine-100 file:px-4 file:py-2 file:font-semibold file:text-pine-800 hover:file:bg-pine-200"
            />
          </Field>
          <SubmitButton size="sm" pendingLabel="Caricamento…">
            <span aria-hidden="true">📷</span> Carica foto
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
