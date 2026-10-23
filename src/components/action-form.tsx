"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { FormPendingContext, FormResult } from "@/components/buttons";
import { useToast } from "@/components/toaster";
import type { ActionResult } from "@/lib/actions/result";

function isNextRedirect(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT"),
  );
}

/**
 * Form che invia i dati a una server action senza svuotare i campi in caso di
 * errore (a differenza di <form action>), mostrando esito e stato di attesa.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  toastOnSuccess = false,
  prepare,
  onSuccess,
  testId,
}: {
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  toastOnSuccess?: boolean;
  /** Trasforma i dati prima dell'invio (es. ridimensionare una foto). Una stringa è un errore. */
  prepare?: (formData: FormData) => Promise<FormData | string>;
  onSuccess?: () => void;
  testId?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const toast = useToast();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const prepared = prepare ? await prepare(formData) : formData;
        if (typeof prepared === "string") {
          setResult({ ok: false, error: prepared });
          return;
        }
        const outcome = await action(null, prepared);
        if (!outcome) return; // la server action ha eseguito un redirect
        setResult(toastOnSuccess && outcome.ok ? null : outcome);
        if (outcome.ok) {
          if (toastOnSuccess && outcome.message) toast.success(outcome.message);
          if (resetOnSuccess) form.reset();
          onSuccess?.();
        }
      } catch (error) {
        if (isNextRedirect(error)) throw error;
        setResult({ ok: false, error: "Operazione non riuscita: ricarica la pagina (F5) e riprova." });
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className={className} aria-busy={pending} data-testid={testId}>
      <FormPendingContext value={pending}>{children}</FormPendingContext>
      {result ? (
        <div className="mt-3">
          <FormResult result={result} />
        </div>
      ) : null}
    </form>
  );
}
