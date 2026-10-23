"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Spinner } from "@/components/buttons";
import { EventCover } from "@/components/event-cover";
import { ProfileEditor } from "@/components/participant/profile-editor";
import { QuoteBanner } from "@/components/quote-banner";
import { Avatar, buttonClasses, cx } from "@/components/ui";
import {
  getParticipantView,
  revealRecipient,
  type ParticipantView,
  type Recipient,
} from "@/lib/actions/participant-view";
import { formatItalianDate } from "@/lib/invite";

type PageState =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "invalid" }
  | { phase: "unavailable" }
  | { phase: "ready"; view: ParticipantView };

type RevealState =
  | { phase: "idle" }
  | { phase: "opening" }
  | { phase: "revealed"; recipient: Recipient }
  | { phase: "error"; message: string };

function readToken(): string {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  } catch {
    return "";
  }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function ParticipantExperience() {
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [reveal, setReveal] = useState<RevealState>({ phase: "idle" });
  const [refreshing, startRefresh] = useTransition();

  const load = useCallback(async () => {
    const token = readToken();
    if (!token) {
      setState({ phase: "missing" });
      return;
    }
    const result = await getParticipantView(token);
    if (result.ok) setState({ phase: "ready", view: result.view });
    else setState({ phase: result.reason === "invalid" ? "invalid" : "unavailable" });
  }, []);

  useEffect(() => {
    // Lettura iniziale del frammento URL: disponibile solo nel browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const onHashChange = () => {
      setReveal({ phase: "idle" });
      setState({ phase: "loading" });
      void load();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [load]);

  const openGift = async () => {
    setReveal({ phase: "opening" });
    const [result] = await Promise.all([revealRecipient(readToken()), wait(1400)]);
    if (!result.ok) {
      setReveal({
        phase: "error",
        message:
          result.reason === "invalid"
            ? "Questo link non è più valido. Chiedi all'organizzatore un nuovo link."
            : "Babbo Natale ha un problema con la slitta: riprova tra poco.",
      });
      return;
    }
    if (!result.recipient) {
      // L'estrazione non è (più) pubblicata: aggiorna la pagina.
      setReveal({ phase: "idle" });
      await load();
      return;
    }
    setReveal({ phase: "revealed", recipient: result.recipient });
  };

  if (state.phase === "loading") {
    return (
      <Panel>
        <div className="flex flex-col items-center py-10" role="status">
          <span className="animate-wiggle text-6xl" aria-hidden="true">
            🎁
          </span>
          <p className="mt-4 text-pine-100">Stiamo controllando la lista di Babbo Natale…</p>
        </div>
      </Panel>
    );
  }

  if (state.phase === "missing" || state.phase === "invalid") {
    return (
      <Panel>
        <Message
          icon="🧭"
          title={state.phase === "missing" ? "Manca il link personale" : "Link non valido"}
          text={
            state.phase === "missing"
              ? "Per vedere la tua pagina apri il link personale che hai ricevuto dall'organizzatore (email o WhatsApp)."
              : "Questo link non è valido o è stato sostituito. Controlla di averlo copiato per intero oppure chiedi all'organizzatore un nuovo link."
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

  const { view } = state;
  const published = view.status === "PUBLISHED" || view.status === "CLOSED";

  return (
    <Panel>
      <EventCover url={view.coverUrl} eventName={view.eventName} />
      <div className="text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-gold-300 uppercase">{view.eventName}</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold sm:text-5xl">Ciao {view.participantName}!</h1>
        <p className="mt-3 text-pine-100">
          Ti diamo il benvenuto nel nostro Secret Santa 🎅 Qui scoprirai a chi dovrai fare il regalo.
        </p>
      </div>

      <EventDetails view={view} />

      <div className="mt-8">
        {!published ? (
          <div className="rounded-3xl bg-white/10 p-6 text-center ring-1 ring-white/15" data-testid="waiting-message">
            <p className="animate-float text-5xl" aria-hidden="true">
              {view.status === "DRAWN" ? "🛷" : "🎄"}
            </p>
            <p className="mt-4 text-lg font-semibold">
              {view.status === "DRAWN"
                ? "L'estrazione è pronta, ma Babbo Natale non ha ancora dato il via libera. Torna più tardi!"
                : "Gli elfi stanno ancora preparando l'estrazione. Torna più tardi!"}
            </p>
            <button
              type="button"
              className="mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/10 disabled:opacity-60"
              onClick={() => startRefresh(load)}
              disabled={refreshing}
            >
              {refreshing ? <Spinner /> : <span aria-hidden="true">🔄</span>} Controlla di nuovo
            </button>
          </div>
        ) : reveal.phase === "revealed" ? (
          <RevealedRecipient recipient={reveal.recipient} closed={view.status === "CLOSED"} />
        ) : (
          <GiftBox
            opening={reveal.phase === "opening"}
            onOpen={openGift}
            again={view.hasRevealed}
            error={reveal.phase === "error" ? reveal.message : null}
          />
        )}
      </div>

      {view.status === "DRAFT" ? <ProfileEditor token={readToken()} onSaved={() => void load()} /> : null}

      <QuoteBanner className="mt-8" />
    </Panel>
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

function EventDetails({ view }: { view: ParticipantView }) {
  if (!view.eventDescription && !view.eventBudget && !view.eventExchangeDate) return null;
  return (
    <div className="mt-6 space-y-2 rounded-2xl bg-white/5 p-4 text-sm text-pine-50 ring-1 ring-white/10">
      {view.eventDescription ? <p className="whitespace-pre-line">{view.eventDescription}</p> : null}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-gold-200">
        {view.eventBudget ? <span>💰 Budget: {view.eventBudget}</span> : null}
        {view.eventExchangeDate ? <span>📅 Scambio: {formatItalianDate(view.eventExchangeDate)}</span> : null}
      </div>
    </div>
  );
}

function GiftBox({
  opening,
  onOpen,
  again,
  error,
}: {
  opening: boolean;
  onOpen: () => void;
  again: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className={cx("relative h-40 w-40", opening ? "animate-wiggle" : "animate-float")} aria-hidden="true">
        {/* Coperchio */}
        <div className={cx("absolute inset-x-0 top-6 z-10", opening && "animate-lid")}>
          <div className="mx-auto h-8 w-40 rounded-lg bg-berry-500 shadow-lg" />
          <div className="absolute inset-y-0 left-1/2 w-6 -translate-x-1/2 bg-gold-300" />
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-4xl">🎀</div>
        </div>
        {/* Scatola */}
        <div className="absolute inset-x-3 bottom-0 h-24 rounded-b-xl bg-berry-600 shadow-xl">
          <div className="absolute inset-y-0 left-1/2 w-6 -translate-x-1/2 bg-gold-400" />
        </div>
      </div>
      <button type="button" onClick={onOpen} disabled={opening} className={cx(buttonClasses("gold", "lg"), "mt-8")}>
        {opening ? <Spinner /> : <span aria-hidden="true">✨</span>}
        {opening ? "Apertura del pacco…" : again ? "Rivedi a chi fai il regalo" : "Scopri a chi fai il regalo"}
      </button>
      <p className="mt-3 text-xs text-pine-200">Assicurati che nessuno stia sbirciando lo schermo! 🤫</p>
      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-berry-700/80 px-4 py-2 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONFETTI = ["✨", "🎉", "⭐", "❄️", "🎊", "✨", "⭐", "🎉"];

function RevealedRecipient({ recipient, closed }: { recipient: Recipient; closed: boolean }) {
  return (
    <div className="relative flex flex-col items-center text-center" data-testid="revealed-recipient">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {CONFETTI.map((item, index) => (
          <span
            key={index}
            className="absolute animate-pop-in text-2xl"
            style={{
              left: `${8 + ((index * 37) % 84)}%`,
              top: `${(index * 23) % 60}%`,
              animationDelay: `${0.2 + index * 0.08}s`,
            }}
          >
            {item}
          </span>
        ))}
      </div>
      <p className="animate-fade-up text-sm font-semibold tracking-[0.2em] text-gold-300 uppercase">Quest&apos;anno farai il regalo a</p>
      <div className="mt-6 animate-pop-in rounded-full p-2 shadow-[0_0_60px_-5px_var(--color-gold-400)] [animation-delay:150ms]">
        <Avatar name={recipient.name} avatar={recipient.avatar} photoUrl={recipient.photoUrl} size="xl" className="ring-4" />
      </div>
      <h2 className="mt-6 animate-fade-up font-display text-5xl font-extrabold text-gold-200 [animation-delay:350ms]">
        {recipient.name}
      </h2>
      <p className="mt-4 max-w-sm animate-fade-up text-pine-100 [animation-delay:550ms]">
        {closed
          ? "L'evento è concluso: speriamo che il regalo sia piaciuto! 🎄"
          : "Acqua in bocca! 🤫 Non dirlo a nessuno e prepara una bella sorpresa."}
      </p>
    </div>
  );
}
