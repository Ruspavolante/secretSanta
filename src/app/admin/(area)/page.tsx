import type { Metadata } from "next";
import Link from "next/link";
import { EventForm } from "@/components/admin/event-form";
import { Alert, Card, SectionTitle, StatusBadge } from "@/components/ui";
import { createEvent } from "@/lib/actions/events";
import { requireAdminPage } from "@/lib/auth";
import { listEvents } from "@/lib/data";
import { formatItalianDate } from "@/lib/invite";

export const metadata: Metadata = { title: "I tuoi eventi" };

export default async function AdminHomePage({ searchParams }: PageProps<"/admin">) {
  const { password } = await searchParams;
  const { supabase } = await requireAdminPage();
  const events = await listEvents(supabase);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <section>
        <h1 className="font-display text-3xl font-bold text-pine-900 sm:text-4xl">I tuoi Secret Santa</h1>
        <p className="mt-2 text-muted">Scegli un evento per gestire partecipanti, esclusioni ed estrazione.</p>
        {password === "aggiornata" ? (
          <div className="mt-4">
            <Alert tone="success" title="Password aggiornata">
              D&apos;ora in poi accedi con la nuova password.
            </Alert>
          </div>
        ) : null}

        {events.length === 0 ? (
          <div className="mt-8 rounded-3xl border-2 border-dashed border-gold-300 bg-snow p-10 text-center">
            <p className="text-5xl" aria-hidden="true">
              🎄
            </p>
            <p className="mt-4 font-semibold text-pine-900">Nessun evento ancora.</p>
            <p className="mt-1 text-sm text-muted">Crea il primo evento con il modulo qui a fianco.</p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/admin/eventi/${event.id}`}
                  className="group block h-full rounded-3xl border border-gold-200 bg-snow p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-pine-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl font-bold text-pine-900 group-hover:text-berry-700">{event.name}</h2>
                    <StatusBadge status={event.status} />
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    👥 {event.participantCount} {event.participantCount === 1 ? "partecipante" : "partecipanti"}
                    {event.exchangeDate ? ` · 📅 ${formatItalianDate(event.exchangeDate)}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card className="h-fit">
        <SectionTitle icon="✨" title="Nuovo evento" description="Potrai modificare tutto anche in seguito." />
        <EventForm action={createEvent} submitLabel="Crea evento" idPrefix="new-event" />
      </Card>
    </div>
  );
}
