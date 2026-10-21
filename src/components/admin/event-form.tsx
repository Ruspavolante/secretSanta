"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/buttons";
import { Field, inputClasses } from "@/components/ui";
import type { ActionResult } from "@/lib/actions/result";
import { LIMITS } from "@/lib/validation";

type EventValues = { name: string; description: string | null; budget: string | null; exchangeDate: string | null };

export function EventForm({
  action,
  initial,
  submitLabel,
  idPrefix,
  disabled,
}: {
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  initial?: EventValues;
  submitLabel: string;
  idPrefix: string;
  disabled?: boolean;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <ActionForm action={action} className="space-y-4" toastOnSuccess>
      <Field label="Nome dell'evento" htmlFor={id("name")}>
        <input
          id={id("name")}
          name="name"
          required
          maxLength={LIMITS.eventName}
          defaultValue={initial?.name}
          placeholder="Es. Natale tra amici 2026"
          className={inputClasses}
          disabled={disabled}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Budget (facoltativo)" htmlFor={id("budget")}>
          <input
            id={id("budget")}
            name="budget"
            maxLength={LIMITS.eventBudget}
            defaultValue={initial?.budget ?? ""}
            placeholder="Es. 20 €"
            className={inputClasses}
            disabled={disabled}
          />
        </Field>
        <Field label="Data dello scambio (facoltativa)" htmlFor={id("exchangeDate")}>
          <input
            id={id("exchangeDate")}
            name="exchangeDate"
            type="date"
            defaultValue={initial?.exchangeDate ?? ""}
            className={inputClasses}
            disabled={disabled}
          />
        </Field>
      </div>
      <Field
        label="Messaggio per i partecipanti (facoltativo)"
        htmlFor={id("description")}
        hint={`Visibile nella pagina personale. Massimo ${LIMITS.eventDescription} caratteri.`}
      >
        <textarea
          id={id("description")}
          name="description"
          rows={3}
          maxLength={LIMITS.eventDescription}
          defaultValue={initial?.description ?? ""}
          placeholder="Es. Ci vediamo a casa di Giulia per la cena!"
          className={inputClasses}
          disabled={disabled}
        />
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Salvataggio…" disabled={disabled}>
        {submitLabel}
      </SubmitButton>
    </ActionForm>
  );
}
