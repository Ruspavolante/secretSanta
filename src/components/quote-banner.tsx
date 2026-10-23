"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { QUOTES, randomQuoteIndex } from "@/lib/quotes";

/** Banner con una citazione a caso sul donare; un pulsante ne pesca un'altra. */
export function QuoteBanner({ className }: { className?: string }) {
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    // Scelta casuale solo nel browser, per non creare differenze con l'HTML del server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(randomQuoteIndex(null));
  }, []);

  if (index === null) return null;
  const quote = QUOTES[index];

  return (
    <figure
      className={cx("animate-fade-up rounded-2xl bg-gold-300/10 p-4 text-left ring-1 ring-gold-300/30", className)}
      data-testid="quote-banner"
      aria-live="polite"
    >
      <p className="text-xs font-semibold tracking-[0.2em] text-gold-300 uppercase">
        <span aria-hidden="true">📜</span> Pensieri sul donare
      </p>
      <blockquote className="mt-2 font-display text-lg leading-snug text-white">«{quote.text}»</blockquote>
      <figcaption className="mt-2 text-sm text-pine-100">
        — <span className="font-semibold text-gold-200">{quote.author}</span>, {quote.role}
        {quote.fictional ? <span className="text-pine-200"> (personaggio immaginario)</span> : null}
        {quote.source ? <span className="text-pine-200"> · {quote.source}</span> : null}
      </figcaption>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {quote.note ? <p className="text-xs text-gold-200 italic">💡 {quote.note}</p> : <span />}
        <button
          type="button"
          onClick={() => setIndex((current) => randomQuoteIndex(current))}
          className="rounded-full px-3 py-1 text-xs font-semibold text-gold-200 ring-1 ring-gold-300/40 transition hover:bg-white/10"
        >
          <span aria-hidden="true">🎲</span> Un&apos;altra citazione
        </button>
      </div>
    </figure>
  );
}
