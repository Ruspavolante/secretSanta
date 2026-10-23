import type { Metadata } from "next";
import Link from "next/link";
import { PasswordResetRequestForm } from "@/components/admin/password-reset-forms";
import { Alert, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Password dimenticata" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/admin/password-dimenticata">) {
  const { errore } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-pine-900 px-4 py-16">
      <Card className="w-full max-w-md">
        <p className="text-center text-5xl" aria-hidden="true">
          🔑
        </p>
        <h1 className="mt-3 text-center font-display text-3xl font-bold text-pine-900">Password dimenticata</h1>
        <p className="mt-2 text-center text-sm text-muted">
          Scrivi l&apos;email del tuo account: ti mandiamo un link per sceglierne una nuova.
        </p>

        <div className="mt-6 space-y-4">
          {errore === "link" ? (
            <Alert tone="error" title="Link non valido o scaduto">
              Il link di recupero vale un&apos;ora e si può usare una sola volta. Richiedine uno nuovo qui sotto.
            </Alert>
          ) : null}
          <PasswordResetRequestForm />
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/admin/login" className="font-medium text-pine-700 underline-offset-4 hover:underline">
            ← Torna all&apos;accesso
          </Link>
        </p>
      </Card>
    </main>
  );
}
