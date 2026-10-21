import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Avatar, Card, Chip, StatusBadge } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import { loadAssignments } from "@/lib/data";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Abbinamenti (privato)" };

const PUBLICATION: Record<string, string> = {
  DRAFT: "Nessuna estrazione",
  DRAWN: "Segreto: non ancora pubblicato",
  PUBLISHED: "Pubblicato: visibile ai partecipanti",
  CLOSED: "Evento chiuso",
};

export default async function AssignmentsPage({ params }: PageProps<"/admin/eventi/[id]/abbinamenti">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const { supabase } = await requireAdminPage();
  const result = await loadAssignments(supabase, id);
  if (!result) notFound();
  const { event, rows } = result;
  const published = event.status === "PUBLISHED" || event.status === "CLOSED";

  return (
    <div className="space-y-6">
      <Link href={`/admin/eventi/${event.id}`} className="text-sm font-medium text-pine-700 underline-offset-4 hover:underline">
        ← Torna all&apos;evento
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold text-pine-900">Abbinamenti · {event.name}</h1>
        <StatusBadge status={event.status} />
      </div>
      <Alert tone="warning" title="Pagina riservata all'organizzatore">
        Se partecipi anche tu allo scambio, questa pagina ti rovina la sorpresa! Non mostrarla e non condividerla.
      </Alert>

      <Card>
        {rows.length === 0 ? (
          <p className="text-center text-muted">Non c&apos;è ancora nessuna estrazione per questo evento.</p>
        ) : (
          <>
            <p className="mb-4 text-sm font-semibold text-pine-900">
              Stato della pubblicazione: <span className="font-normal">{PUBLICATION[event.status]}</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm" data-testid="assignments-table">
                <thead className="border-b border-gold-200 text-xs tracking-wider text-muted uppercase">
                  <tr>
                    <th scope="col" className="py-3 pr-4">
                      Chi regala
                    </th>
                    <th scope="col" className="py-3 pr-4">
                      A chi
                    </th>
                    <th scope="col" className="py-3">
                      Pubblicazione
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gold-100">
                  {rows.map((row) => (
                    <tr key={row.giver.name}>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-3 font-medium text-pine-900">
                          <Avatar name={row.giver.name} avatar={row.giver.avatar} photoUrl={row.giver.photoUrl} size="sm" />
                          {row.giver.name}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-3 font-medium text-pine-900">
                          <span aria-hidden="true" className="text-berry-600">
                            🎁→
                          </span>
                          <Avatar name={row.receiver.name} avatar={row.receiver.avatar} photoUrl={row.receiver.photoUrl} size="sm" />
                          {row.receiver.name}
                        </span>
                      </td>
                      <td className="py-3">
                        {!published ? (
                          <Chip tone="info">🔒 Non pubblicato</Chip>
                        ) : row.revealed ? (
                          <Chip tone="good">🎁 Scoperto</Chip>
                        ) : (
                          <Chip tone="warn">Pubblicato, non ancora aperto</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
