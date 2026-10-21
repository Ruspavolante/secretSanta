"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useToast } from "@/components/toaster";
import { buttonClasses, cx, type ButtonVariant } from "@/components/ui";
import type { ActionResult } from "@/lib/actions/result";

/** Stato di attesa dei form gestiti da <ActionForm>. */
export const FormPendingContext = createContext(false);

export function Spinner() {
  return <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const status = useFormStatus();
  const contextPending = useContext(FormPendingContext);
  const pending = status.pending || contextPending;
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cx(buttonClasses(variant, size), className)}
      aria-busy={pending}
    >
      {pending ? <Spinner /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export type Confirmation = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "normal";
};

export function ConfirmDialog({
  open,
  confirmation,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  confirmation: Confirmation;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(92vw,28rem)] rounded-3xl border border-gold-200 bg-snow p-0 text-ink shadow-2xl"
    >
      <div className="p-6">
        <h2 className="font-display text-xl font-bold text-pine-900">{confirmation.title}</h2>
        <div className="mt-3 text-sm text-muted">{confirmation.body}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={buttonClasses("ghost")} onClick={onCancel}>
            Annulla
          </button>
          <button
            type="button"
            className={buttonClasses(confirmation.tone === "danger" ? "primary" : "secondary")}
            onClick={onConfirm}
          >
            {confirmation.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function isNextRedirect(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT"),
  );
}

/** Pulsante che esegue una server action (con conferma opzionale) e mostra l'esito. */
export function ActionButton({
  action,
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  confirm,
  className,
  onDone,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  confirm?: Confirmation;
  className?: string;
  onDone?: (result: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  const run = () => {
    setConfirming(false);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          if (result.message) toast.success(result.message);
        } else {
          toast.error(result.error, result.details);
        }
        onDone?.(result);
      } catch (error) {
        // I redirect di Next.js devono propagarsi.
        if (isNextRedirect(error)) throw error;
        toast.error("Operazione non riuscita: controlla la connessione e riprova.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        className={cx(buttonClasses(variant, size), className)}
        onClick={() => (confirm ? setConfirming(true) : run())}
      >
        {pending ? <Spinner /> : null}
        {pending && pendingLabel ? pendingLabel : children}
      </button>
      {confirm ? (
        <ConfirmDialog open={confirming} confirmation={confirm} onConfirm={run} onCancel={() => setConfirming(false)} />
      ) : null}
    </>
  );
}

/** Copia negli appunti con ripiego per browser senza Clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ripiego sotto
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export function CopyButton({
  text,
  label,
  copiedMessage,
  variant = "ghost",
  onCopied,
}: {
  text: string;
  label: string;
  copiedMessage: string;
  variant?: ButtonVariant;
  onCopied?: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClasses(variant, "sm")}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
          toast.success(copiedMessage);
          onCopied?.();
        } else {
          toast.error("Copia non riuscita: seleziona il testo e copialo a mano.");
        }
      }}
    >
      <span aria-hidden="true">{copied ? "✅" : "📋"}</span>
      {copied ? "Copiato!" : label}
    </button>
  );
}

export function FormResult({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  if (result.ok) {
    return result.message ? (
      <p role="status" className="text-sm font-medium text-pine-700">
        ✅ {result.message}
      </p>
    ) : null;
  }
  return (
    <div role="alert" className="text-sm font-medium text-berry-700">
      <p>⚠️ {result.error}</p>
      {result.details?.length ? (
        <ul className="mt-1 list-disc pl-5 font-normal">
          {result.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
