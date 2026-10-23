"use client";

import { buttonClasses } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-6xl" aria-hidden="true">
        ⛄
      </p>
      <h1 className="mt-4 font-display text-3xl font-bold text-pine-900">Qualcosa è andato storto</h1>
      <p className="mt-3 max-w-md text-muted">
        Non siamo riusciti a caricare la pagina. Potrebbe essere un problema temporaneo del servizio: riprova tra poco.
      </p>
      <p className="mt-2 max-w-md text-sm text-muted">
        Sei l&apos;organizzatore? Con il piano gratuito il progetto Supabase va in pausa dopo una settimana di
        inattività: riattivalo dalla dashboard di Supabase.
      </p>
      {error.digest ? (
        // Lo stesso codice compare nei log del server (Vercel → Logs) accanto al motivo dell'errore.
        <p className="mt-4 text-xs text-muted">
          Codice errore: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <button type="button" onClick={reset} className={`${buttonClasses("secondary")} mt-8`}>
        Riprova
      </button>
    </main>
  );
}
