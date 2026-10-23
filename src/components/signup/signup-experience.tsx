"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ActionForm } from "@/components/action-form";
import { AvatarPicker } from "@/components/admin/avatar-picker";
import { CopyButton, Spinner, SubmitButton } from "@/components/buttons";
import { EventCover } from "@/components/event-cover";
import { QuoteBanner } from "@/components/quote-banner";
import { buttonClasses, cx, Field, fileInputClasses, inputClasses } from "@/components/ui";
import { getSignupInfo, registerParticipant, type SignupEvent, type SignupResult } from "@/lib/actions/signup";
import { preparePhotoField } from "@/lib/image-resize";
import { formatItalianDate } from "@/lib/invite";
import { LIMITS } from "@/lib/validation";

type PageState =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "invalid" }
  | { phase: "unavailable" }
  | { phase: "ready"; event: SignupEvent };

type Registered = Extract<SignupResult, { ok: true }>;

function readToken(): string {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  } catch {
    return "";
  }
}

const prepareOptionalPhoto = (formData: FormData) => preparePhotoField(formData, { required: false });

export function SignupExperience() {
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [registered, setRegistered] = useState<Registered | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const load = useCallback(async () => {
    const token = readToken();
    if (!token) {
      setState({ phase: "missing" });
      return;
    }
    const result = await getSignupInfo(token);
    if (result.ok) setState({ phase: "ready", event: result.event });
    else setState({ phase: result.reason === "invalid" ? "invalid" : "unavailable" });
  }, []);

  useEffect(() => {
    // Lettura iniziale del frammento URL: disponibile solo nel browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const onHashChange = () => {
      setRegistered(null);
      setState({ phase: "loading" });
      void load();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [load]);

  if (state.phase === "loading") {
    return (
      <Panel>
        <div className="flex flex-col items-center py-10" role="status">
          <span className="animate-wiggle text-6xl" aria-hidden="true">
            📝
          </span>
          <p className="mt-4 text-pine-100">Stiamo aprendo il registro di Babbo Natale…</p>
        </div>
      </Panel>
    );
  }

  if (state.phase === "missing" || state.phase === "invalid") {
    return (
      <Panel>
        <Message
          icon="🧭"
          title={state.phase === "missing" ? "Manca il link d'iscrizione" : "Link non valido"}
          text={
            state.phase === "missing"
              ? "Per iscriverti apri il link che l'organizzatore ha condiviso nel gruppo."
              : "Questo link d'iscrizione non è valido o è stato sostituito. Controlla di averlo copiato per intero oppure chiedi all'organizzatore quello nuovo."
          }
        />
      </Panel>
    );
  }

  if (state.phase === "unavailable") {
    return (
      <Panel>
        <Message icon="🛷" title="Servizio momentaneamente non disponibile" text="Non riusciamo a contattare il Polo Nord. Riprova tra qualche istante." />
        <div className="mt-6 text-center">
          <button type="button" className={buttonClasses("gold")} onClick={() => startRefresh(load)} disabled={refreshing}>
            {refreshing ? <Spinner /> : null} Riprova
          </button>
        </div>
      </Panel>
    );
  }

  const { event } = state;

  return (
    <Panel>
      <EventCover url={event.coverUrl} eventName={event.eventName} />
      <div className="text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-gold-300 uppercase">Secret Santa</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold sm:text-5xl">{event.eventName}</h1>
      </div>
      <EventDetails event={event} />

      <div className="mt-8">
        {registered ? (
          <Registered result={registered} />
        ) : !event.isOpen ? (
          <div className="rounded-3xl bg-white/10 p-6 text-center ring-1 ring-white/15" data-testid="signup-closed">
            <p className="text-5xl" aria-hidden="true">
              🔒
            </p>
            <p className="mt-4 text-lg font-semibold">Le iscrizioni sono chiuse.</p>
            <p className="mt-2 text-sm text-pine-100">Se vuoi partecipare chiedi all&apos;organizzatore.</p>
          </div>
        ) : (
          <SignupForm onRegistered={setRegistered} />
        )}
      </div>

      <QuoteBanner className="mt-8" />
    </Panel>
  );
}

function SignupForm({ onRegistered }: { onRegistered: (result: Registered) => void }) {
  return (
    <div className="rounded-3xl bg-snow p-5 text-ink shadow-lg sm:p-6">
      <h2 className="font-display text-2xl font-bold text-pine-900">Iscriviti</h2>
      <p className="mt-1 text-sm text-muted">
        Riceverai per email il tuo link personale: lì scoprirai a chi fare il regalo quando l&apos;organizzatore darà il via.
      </p>
      <ActionForm
        action={async (_previous, formData) => {
          const result = await registerParticipant(readToken(), formData);
          if (!result.ok) return result;
          onRegistered(result);
          return { ok: true };
        }}
        prepare={prepareOptionalPhoto}
        className="mt-5 space-y-4"
        testId="signup-form"
      >
        <Field label="Il tuo nome" htmlFor="signup-name" hint="Così ti vedrà chi ti estrarrà.">
          <input id="signup-name" name="name" required maxLength={LIMITS.participantName} autoComplete="given-name" placeholder="Es. Mario" className={inputClasses} />
        </Field>
        <Field label="La tua email" htmlFor="signup-email" hint="Serve solo per mandarti il tuo link personale. Gli altri partecipanti non la vedono.">
          <input
            id="signup-email"
            name="email"
            type="email"
            required
            maxLength={LIMITS.email}
            autoComplete="email"
            placeholder="mario@example.com"
            className={inputClasses}
          />
        </Field>
        <Field label="La tua foto (facoltativa)" htmlFor="signup-photo" hint="La vedrà chi ti estrarrà. JPEG, PNG o WebP.">
          <input id="signup-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className={fileInputClasses} />
        </Field>
        <AvatarPicker name="avatar" idPrefix="signup-avatar" />
        <p className="-mt-2 text-xs text-muted">Se non carichi una foto verrà mostrata l&apos;immagine che scegli qui.</p>
        <SubmitButton variant="gold" pendingLabel="Iscrizione in corso…" className="w-full">
          <span aria-hidden="true">🎁</span> Partecipo!
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

function Registered({ result }: { result: Registered }) {
  return (
    <div className="rounded-3xl bg-snow p-5 text-ink shadow-lg sm:p-6" data-testid="signup-done">
      <p className="text-center text-5xl" aria-hidden="true">
        🎉
      </p>
      <h2 className="mt-3 text-center font-display text-2xl font-bold text-pine-900">Sei dentro, {result.participantName}!</h2>
      <p className={cx("mt-3 rounded-2xl p-3 text-sm", result.emailSent ? "bg-pine-50 text-pine-800" : "bg-gold-50 text-ink")}>
        {result.emailSent
          ? `📧 Ti abbiamo inviato il link personale a ${result.email}. Se non lo trovi controlla lo spam.`
          : "⚠️ Non siamo riusciti a inviarti l'email: salva subito il link qui sotto, ti servirà per scoprire a chi fare il regalo."}
      </p>
      <div className="mt-4">
        <Field label="Il tuo link personale" htmlFor="personal-link" hint="È solo tuo: non condividerlo con nessuno.">
          <input id="personal-link" readOnly value={result.personalLink} className={cx(inputClasses, "font-mono text-xs")} onFocus={(e) => e.currentTarget.select()} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton text={result.personalLink} label="Copia il link" copiedMessage="Link copiato: salvalo in un posto sicuro." variant="secondary" />
        <a href={result.personalLink} className={buttonClasses("gold", "sm")}>
          <span aria-hidden="true">🎄</span> Apri la tua pagina
        </a>
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-up rounded-[2rem] border border-gold-300/40 bg-pine-900/70 p-6 shadow-2xl backdrop-blur-sm sm:p-10">
      {children}
    </div>
  );
}

function Message({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="text-center">
      <p className="text-6xl" aria-hidden="true">
        {icon}
      </p>
      <h1 className="mt-4 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-3 text-pine-100">{text}</p>
    </div>
  );
}

function EventDetails({ event }: { event: SignupEvent }) {
  if (!event.eventDescription && !event.eventBudget && !event.eventExchangeDate) return null;
  return (
    <div className="mt-6 space-y-2 rounded-2xl bg-white/5 p-4 text-sm text-pine-50 ring-1 ring-white/10">
      {event.eventDescription ? <p className="whitespace-pre-line">{event.eventDescription}</p> : null}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-gold-200">
        {event.eventBudget ? <span>💰 Budget: {event.eventBudget}</span> : null}
        {event.eventExchangeDate ? <span>📅 Scambio: {formatItalianDate(event.eventExchangeDate)}</span> : null}
      </div>
    </div>
  );
}
