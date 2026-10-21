"use client";

import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ActionButton, SubmitButton } from "@/components/buttons";
import { Alert, buttonClasses, Field, inputClasses } from "@/components/ui";
import { closeEvent, publishDraw, resetDraw, runDraw } from "@/lib/actions/draw";
import type { EventStatus } from "@/lib/data";

const dateTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(iso))
    : "";

export function DrawPanel({
  eventId,
  eventName,
  status,
  participantCount,
  revealedCount,
  feasibility,
  drawnAt,
  publishedAt,
  closedAt,
}: {
  eventId: string;
  eventName: string;
  status: EventStatus;
  participantCount: number;
  revealedCount: number;
  feasibility: { feasible: true } | { feasible: false; problems: string[] };
  drawnAt: string | null;
  publishedAt: string | null;
  closedAt: string | null;
}) {
  const resultsLink = (
    <Link href={`/admin/eventi/${eventId}/abbinamenti`} className={buttonClasses("ghost")}>
      <span aria-hidden="true">🔍</span> Verifica abbinamenti (privato)
    </Link>
  );

  if (status === "DRAFT") {
    return (
      <div className="space-y-4">
        {feasibility.feasible ? (
          <Alert tone="success" title="Tutto pronto per l'estrazione">
            Con {participantCount} partecipanti e le esclusioni attuali esiste almeno un abbinamento valido per tutti.
          </Alert>
        ) : (
          <Alert tone="warning" title="L'estrazione non è ancora possibile">
            <ul className="list-disc space-y-1 pl-5" data-testid="feasibility-problems">
              {feasibility.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Alert>
        )}
        <ActionButton
          action={runDraw.bind(null, eventId)}
          size="lg"
          pendingLabel="Estrazione in corso…"
          confirm={{
            title: "Fare l'estrazione?",
            body: "Gli abbinamenti verranno generati e salvati, ma resteranno segreti: i partecipanti non vedranno nulla finché non pubblichi. Dopo l'estrazione non potrai aggiungere o togliere partecipanti ed esclusioni senza annullarla.",
            confirmLabel: "Estrai ora",
          }}
        >
          <span aria-hidden="true">🎲</span> Genera estrazione
        </ActionButton>
      </div>
    );
  }

  if (status === "DRAWN") {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Estrazione completata, ancora segreta">
          Estratta il {dateTime(drawnAt)}. I partecipanti che aprono il link vedono solo il messaggio di attesa.
        </Alert>
        <div className="flex flex-wrap gap-3">
          {resultsLink}
          <ActionButton
            action={publishDraw.bind(null, eventId)}
            pendingLabel="Pubblicazione…"
            confirm={{
              title: "Pubblicare l'estrazione?",
              body: "Da questo momento ogni partecipante potrà scoprire, con il proprio link, a chi fare il regalo.",
              confirmLabel: "Pubblica",
            }}
          >
            <span aria-hidden="true">📣</span> Pubblica estrazione
          </ActionButton>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-gold-100 pt-4">
          <ActionButton
            action={runDraw.bind(null, eventId)}
            variant="ghost"
            pendingLabel="Estrazione in corso…"
            confirm={{
              title: "Rifare l'estrazione?",
              body: "Gli abbinamenti attuali verranno sostituiti da una nuova estrazione. Nessuno li ha ancora visti.",
              confirmLabel: "Rifai estrazione",
            }}
          >
            <span aria-hidden="true">🔁</span> Rifai estrazione
          </ActionButton>
          <ActionButton
            action={() => resetDraw(eventId, null, new FormData())}
            variant="danger"
            pendingLabel="Annullamento…"
            confirm={{
              title: "Annullare l'estrazione?",
              body: "Gli abbinamenti verranno cancellati e l'evento tornerà in preparazione: potrai di nuovo modificare partecipanti ed esclusioni.",
              confirmLabel: "Annulla estrazione",
              tone: "danger",
            }}
          >
            <span aria-hidden="true">↩️</span> Annulla estrazione
          </ActionButton>
        </div>
      </div>
    );
  }

  if (status === "PUBLISHED") {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Estrazione pubblicata">
          Pubblicata il {dateTime(publishedAt)}. {revealedCount} su {participantCount} partecipanti hanno già scoperto
          il proprio destinatario.
        </Alert>
        <div className="flex flex-wrap gap-3">
          {resultsLink}
          <ActionButton
            action={closeEvent.bind(null, eventId)}
            variant="secondary"
            pendingLabel="Chiusura…"
            confirm={{
              title: "Chiudere l'evento?",
              body: "L'evento verrà segnato come concluso e non sarà più modificabile. I partecipanti potranno ancora rivedere il proprio abbinamento.",
              confirmLabel: "Chiudi evento",
            }}
          >
            <span aria-hidden="true">🔒</span> Chiudi evento
          </ActionButton>
        </div>
        <details className="rounded-2xl border border-berry-200 bg-berry-50/50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-berry-800">
            Procedura sicura: annullare l&apos;estrazione pubblicata e rifarla
          </summary>
          <div className="mt-3 space-y-3 text-sm text-berry-900">
            <p>
              Attenzione: alcuni partecipanti potrebbero aver già visto il proprio abbinamento. Annullando, gli
              abbinamenti verranno cancellati, l&apos;evento tornerà in preparazione e dovrai fare una nuova estrazione
              e avvisare tutti.
            </p>
            <ActionForm action={resetDraw.bind(null, eventId)} toastOnSuccess className="space-y-3">
              <Field label={`Per confermare scrivi il nome dell'evento: «${eventName}»`} htmlFor="reset-confirmation">
                <input id="reset-confirmation" name="confirmation" required autoComplete="off" className={inputClasses} />
              </Field>
              <SubmitButton pendingLabel="Annullamento…">Annulla l&apos;estrazione pubblicata</SubmitButton>
            </ActionForm>
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Evento chiuso">
        Chiuso il {dateTime(closedAt)}. I partecipanti possono ancora rivedere il proprio abbinamento.
      </Alert>
      {resultsLink}
    </div>
  );
}
