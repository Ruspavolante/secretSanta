import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddParticipantForm } from "@/components/admin/add-participant-form";
import { CoverPanel } from "@/components/admin/cover-panel";
import { DrawPanel } from "@/components/admin/draw-panel";
import { EventForm } from "@/components/admin/event-form";
import { ExclusionsPanel } from "@/components/admin/exclusions-panel";
import { ParticipantCard } from "@/components/admin/participant-card";
import { SignupPanel } from "@/components/admin/signup-panel";
import { ActionButton } from "@/components/buttons";
import { Alert, Card, cx, SectionTitle, StatusBadge } from "@/components/ui";
import { deleteEvent, updateEvent } from "@/lib/actions/events";
import { sendPendingInviteEmails } from "@/lib/actions/invites";
import { requireAdminPage } from "@/lib/auth";
import { loadEventDetail, type EventStatus } from "@/lib/data";
import { isEmailConfigured } from "@/lib/email";
import { formatItalianDate } from "@/lib/invite";
import { getBaseUrl } from "@/lib/site";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Gestione evento" };

const STEPS: { status: EventStatus[]; label: string }[] = [
  { status: ["DRAFT"], label: "Preparazione" },
  { status: ["DRAWN"], label: "Estrazione segreta" },
  { status: ["PUBLISHED"], label: "Pubblicata" },
  { status: ["CLOSED"], label: "Chiuso" },
];

function Steps({ status }: { status: EventStatus }) {
  const current = STEPS.findIndex((step) => step.status.includes(status));
  return (
    <ol className="mt-5 grid grid-cols-4 gap-2 text-center text-[11px] font-semibold sm:text-xs" aria-label="Avanzamento dell'evento">
      {STEPS.map((step, index) => (
        <li key={step.label} aria-current={index === current ? "step" : undefined}>
          <div
            className={cx(
              "h-1.5 rounded-full",
              index < current && "bg-pine-500",
              index === current && "bg-gold-400",
              index > current && "bg-stone-200",
            )}
          />
          <p className={cx("mt-1.5", index === current ? "text-pine-900" : "text-muted")}>{step.label}</p>
        </li>
      ))}
    </ol>
  );
}

export default async function EventPage({ params }: PageProps<"/admin/eventi/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const { supabase } = await requireAdminPage();
  const detail = await loadEventDetail(supabase, id);
  if (!detail) notFound();

  const { event, participants, exclusions, feasibility } = detail;
  const baseUrl = await getBaseUrl();
  const emailEnabled = isEmailConfigured();
  const isDraft = event.status === "DRAFT";
  const isClosed = event.status === "CLOSED";
  const pendingEmails = participants.filter((p) => p.email && p.inviteMethod !== "email").length;
  const revealedCount = participants.filter((p) => p.revealedAt).length;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm font-medium text-pine-700 underline-offset-4 hover:underline">
          ← Tutti gli eventi
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold text-pine-900 sm:text-4xl">{event.name}</h1>
          <StatusBadge status={event.status} />
        </div>
        <p className="mt-2 text-sm text-muted">
          👥 {participants.length} partecipanti
          {event.budget ? ` · 💰 ${event.budget}` : ""}
          {event.exchangeDate ? ` · 📅 ${formatItalianDate(event.exchangeDate)}` : ""}
        </p>
        <Steps status={event.status} />
      </div>

      <Card>
        <SectionTitle icon="🎲" title="Estrazione" description="Genera, verifica in privato e pubblica quando vuoi." />
        <DrawPanel
          eventId={event.id}
          eventName={event.name}
          status={event.status}
          participantCount={participants.length}
          revealedCount={revealedCount}
          feasibility={feasibility}
          drawnAt={event.drawnAt}
          publishedAt={event.publishedAt}
          closedAt={event.closedAt}
        />
      </Card>

      <Card>
        <SectionTitle
          icon="🔗"
          title="Link di iscrizione"
          description="Un solo link per tutto il gruppo: ognuno si iscrive da solo con nome, email e foto."
        />
        <SignupPanel
          event={{
            id: event.id,
            name: event.name,
            status: event.status,
            budget: event.budget,
            exchangeDate: event.exchangeDate,
            signupToken: event.signupToken,
            signupOpen: event.signupOpen,
          }}
          baseUrl={baseUrl}
        />
      </Card>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <SectionTitle
            icon="👥"
            title="Partecipanti"
            description="Ognuno ha un link personale da inviare con il messaggio d'invito."
          />
          {!isDraft ? (
            <div className="mb-4">
              <Alert tone="info">
                {isClosed
                  ? "L'evento è chiuso: i partecipanti non si possono più modificare."
                  : "L'estrazione è stata fatta: puoi modificare nomi, email e foto, ma per aggiungere o eliminare partecipanti devi prima annullarla."}
              </Alert>
            </div>
          ) : null}
          {isDraft ? <AddParticipantForm eventId={event.id} /> : null}

          {emailEnabled && participants.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-gold-50 p-3 text-sm ring-1 ring-gold-200">
              <span className="flex-1">📬 Invio automatico attivo · {pendingEmails} email da inviare</span>
              <ActionButton
                action={sendPendingInviteEmails.bind(null, event.id)}
                size="sm"
                pendingLabel="Invio in corso…"
                confirm={{
                  title: "Inviare gli inviti via email?",
                  body: "Ogni partecipante con un indirizzo email che non ha ancora ricevuto l'email riceverà un messaggio separato con il solo proprio link personale.",
                  confirmLabel: "Invia",
                }}
              >
                Invia a chi manca
              </ActionButton>
            </div>
          ) : participants.length > 0 ? (
            <p className="mt-4 text-xs text-muted">
              💡 L&apos;invio automatico delle email non è configurato: apri «Invito» su ogni partecipante per copiare il
              messaggio o inviarlo con WhatsApp.
            </p>
          ) : null}

          {participants.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted">
              Nessun partecipante ancora. Aggiungi il primo qui sopra o condividi il link di iscrizione!
            </p>
          ) : (
            <ul className="mt-5 space-y-3">
              {participants.map((participant) => (
                <ParticipantCard
                  key={participant.id}
                  participant={participant}
                  event={{ id: event.id, name: event.name, budget: event.budget, exchangeDate: event.exchangeDate }}
                  baseUrl={baseUrl}
                  emailEnabled={emailEnabled}
                  canDelete={isDraft}
                  canEdit={!isClosed}
                />
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-8">
          <Card>
            <SectionTitle icon="🚫" title="Esclusioni" description="Abbinamenti da evitare, per esempio tra coppie o coinquilini." />
            <ExclusionsPanel
              eventId={event.id}
              participants={participants.map((p) => ({ id: p.id, name: p.name }))}
              exclusions={exclusions}
              editable={isDraft}
            />
          </Card>

          <Card>
            <SectionTitle icon="🖼️" title="Foto di copertina" description="La vedono tutti quando aprono i link di questo evento." />
            <CoverPanel eventId={event.id} eventName={event.name} coverUrl={event.coverUrl} disabled={isClosed} />
          </Card>

          <Card>
            <SectionTitle icon="⚙️" title="Dettagli dell'evento" />
            <EventForm
              action={updateEvent.bind(null, event.id)}
              initial={{ name: event.name, description: event.description, budget: event.budget, exchangeDate: event.exchangeDate }}
              submitLabel="Salva dettagli"
              idPrefix="edit-event"
              disabled={isClosed}
            />
            <div className="mt-6 border-t border-gold-100 pt-5">
              <ActionButton
                action={deleteEvent.bind(null, event.id)}
                variant="danger"
                size="sm"
                pendingLabel="Eliminazione…"
                confirm={{
                  title: "Eliminare l'evento?",
                  body: `Verranno cancellati definitivamente «${event.name}», i partecipanti, le foto, le esclusioni e gli abbinamenti. I link personali smetteranno di funzionare.`,
                  confirmLabel: "Elimina definitivamente",
                  tone: "danger",
                }}
              >
                <span aria-hidden="true">🗑️</span> Elimina evento
              </ActionButton>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
