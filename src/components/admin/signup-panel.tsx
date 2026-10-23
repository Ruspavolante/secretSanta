"use client";

import { ActionButton, CopyButton } from "@/components/buttons";
import { Alert, buttonClasses, Chip, cx, Field, inputClasses } from "@/components/ui";
import { regenerateSignupLink, setSignupOpen } from "@/lib/actions/signup-admin";
import { buildSignupLink, buildSignupMessage, buildWhatsAppUrl } from "@/lib/invite";
import type { EventStatus } from "@/lib/data";

/** Link d'iscrizione da condividere nel gruppo: ognuno si iscrive da solo. */
export function SignupPanel({
  event,
  baseUrl,
}: {
  event: {
    id: string;
    name: string;
    status: EventStatus;
    budget: string | null;
    exchangeDate: string | null;
    signupToken: string | null;
    signupOpen: boolean;
  };
  baseUrl: string;
}) {
  const isDraft = event.status === "DRAFT";
  const active = isDraft && event.signupOpen && event.signupToken;

  if (!isDraft) {
    return (
      <Alert tone="info">
        Le iscrizioni sono chiuse perché l&apos;estrazione è stata fatta. Se la annulli, il link d&apos;iscrizione torna
        com&apos;era prima.
      </Alert>
    );
  }

  if (!active) {
    return (
      <div className="space-y-3" data-testid="signup-panel">
        <p className="text-sm text-muted">
          Crea un link da mandare nel gruppo (es. WhatsApp): ognuno inserisce nome, email e, se vuole, una foto, e riceve
          subito per email il proprio link personale. Le iscrizioni si chiudono da sole quando fai l&apos;estrazione.
        </p>
        <ActionButton action={setSignupOpen.bind(null, event.id, true)} variant="secondary" pendingLabel="Apertura…">
          <span aria-hidden="true">🔓</span> {event.signupToken ? "Riapri le iscrizioni" : "Apri le iscrizioni"}
        </ActionButton>
      </div>
    );
  }

  const link = buildSignupLink(baseUrl, event.signupToken!);
  const message = buildSignupMessage({ eventName: event.name, link, budget: event.budget, exchangeDate: event.exchangeDate });

  return (
    <div className="space-y-4" data-testid="signup-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="good">🟢 Iscrizioni aperte</Chip>
        <span className="text-xs text-muted">Chi si iscrive compare subito nella lista dei partecipanti.</span>
      </div>
      <Field label="Link d'iscrizione" htmlFor="signup-link" hint="Chi ha questo link può solo iscriversi: non vede gli altri partecipanti né i loro link.">
        <input id="signup-link" readOnly value={link} className={cx(inputClasses, "font-mono text-xs")} onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={message} label="Copia messaggio per il gruppo" copiedMessage="Messaggio copiato: incollalo nel gruppo." variant="secondary" />
        <CopyButton text={link} label="Copia solo il link" copiedMessage="Link d'iscrizione copiato." />
        <a href={buildWhatsAppUrl(message)} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", "sm")}>
          <span aria-hidden="true">💬</span> Apri WhatsApp
        </a>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-gold-100 pt-4">
        <ActionButton action={setSignupOpen.bind(null, event.id, false)} variant="ghost" size="sm" pendingLabel="Chiusura…">
          <span aria-hidden="true">🔒</span> Chiudi le iscrizioni
        </ActionButton>
        <ActionButton
          action={regenerateSignupLink.bind(null, event.id)}
          variant="danger"
          size="sm"
          className="sm:ml-auto"
          confirm={{
            title: "Creare un nuovo link d'iscrizione?",
            body: "Il link attuale smetterà di funzionare (chi è già iscritto resta iscritto e mantiene il proprio link personale). Usalo se il link è finito nel posto sbagliato.",
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
