"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

type Toast = { id: number; tone: "success" | "error"; message: string; details?: string[] };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string, details?: string[]) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === "error" ? 10_000 : 5_000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push({ tone: "success", message }),
      error: (message, details) => push({ tone: "error", message, details }),
    }),
    [push],
  );

  return (
    <ToastContext value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-md animate-fade-up items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-xl ring-1",
              toast.tone === "success" ? "bg-pine-900 text-white ring-pine-700" : "bg-berry-700 text-white ring-berry-800",
            )}
          >
            <span aria-hidden="true" className="text-lg leading-5">
              {toast.tone === "success" ? "✅" : "⚠️"}
            </span>
            <div className="flex-1">
              <p>{toast.message}</p>
              {toast.details?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-white/90">
                  {toast.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-full px-2 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Chiudi notifica"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast deve essere usato dentro <Toaster>");
  return api;
}
