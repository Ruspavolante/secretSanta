"use client";

import { ActionForm } from "@/components/action-form";
import { ActionButton, SubmitButton } from "@/components/buttons";
import { Field, inputClasses } from "@/components/ui";
import { addExclusion, removeExclusions } from "@/lib/actions/exclusions";
import type { ExclusionRow } from "@/lib/data";

type Person = { id: string; name: string };

type Group = { ids: string[]; a: string; b: string; both: boolean };

/** Raggruppa A→B e B→A in un'unica riga "A ↔ B". */
function groupExclusions(exclusions: ExclusionRow[], names: Map<string, string>): Group[] {
  const byPair = new Map(exclusions.map((e) => [`${e.giverId}>${e.receiverId}`, e]));
  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const exclusion of exclusions) {
    if (seen.has(exclusion.id)) continue;
    seen.add(exclusion.id);
    const reverse = byPair.get(`${exclusion.receiverId}>${exclusion.giverId}`);
    if (reverse) seen.add(reverse.id);
    groups.push({
      ids: reverse ? [exclusion.id, reverse.id] : [exclusion.id],
      a: names.get(exclusion.giverId) ?? "?",
      b: names.get(exclusion.receiverId) ?? "?",
      both: Boolean(reverse),
    });
  }
  return groups;
}

export function ExclusionsPanel({
  eventId,
  participants,
  exclusions,
  editable,
}: {
  eventId: string;
  participants: Person[];
  exclusions: ExclusionRow[];
  editable: boolean;
}) {
  const names = new Map(participants.map((p) => [p.id, p.name]));
  const groups = groupExclusions(exclusions, names);

  return (
    <div className="space-y-5">
      {editable ? (
        participants.length < 2 ? (
          <p className="text-sm text-muted">Aggiungi almeno due partecipanti per impostare le esclusioni.</p>
        ) : (
          <ActionForm action={addExclusion} toastOnSuccess resetOnSuccess className="space-y-4 rounded-2xl bg-berry-50/50 p-4 ring-1 ring-berry-100" testId="exclusion-form">
            <input type="hidden" name="eventId" value={eventId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Chi regala…" htmlFor="exclusion-giver">
                <select id="exclusion-giver" name="giverId" required defaultValue="" className={inputClasses}>
                  <option value="" disabled>
                    Scegli una persona
                  </option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="…non può regalare a" htmlFor="exclusion-receiver">
                <select id="exclusion-receiver" name="receiverId" required defaultValue="" className={inputClasses}>
                  <option value="" disabled>
                    Scegli una persona
                  </option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-pine-900">
              <input type="checkbox" name="bothDirections" defaultChecked className="size-4 rounded accent-pine-700" />
              Vale in entrambe le direzioni (nessuno dei due regala all&apos;altro)
            </label>
            <SubmitButton variant="secondary" pendingLabel="Salvataggio…">
              <span aria-hidden="true">🚫</span> Aggiungi esclusione
            </SubmitButton>
          </ActionForm>
        )
      ) : null}

      {groups.length === 0 ? (
        <p className="text-sm text-muted">Nessuna esclusione: tutti possono pescare tutti (tranne sé stessi).</p>
      ) : (
        <ul className="divide-y divide-gold-100 rounded-2xl border border-gold-200 bg-white" data-testid="exclusion-list">
          {groups.map((group) => (
            <li key={group.ids.join("-")} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm text-pine-900">
                <strong>{group.a}</strong>{" "}
                <span aria-hidden="true" className="mx-1 text-berry-600">
                  {group.both ? "↔" : "→"}
                </span>
                <span className="sr-only">{group.both ? " e " : " non regala a "}</span>
                <strong>{group.b}</strong>
                <span className="ml-2 text-xs text-muted">
                  {group.both ? "non si fanno il regalo a vicenda" : `${group.a} non regala a ${group.b}`}
                </span>
              </p>
              {editable ? (
                <ActionButton action={removeExclusions.bind(null, eventId, group.ids)} variant="danger" size="sm" pendingLabel="Rimozione…">
                  Rimuovi
                </ActionButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
