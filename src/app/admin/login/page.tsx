import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { Alert, buttonClasses, Card } from "@/components/ui";
import { logout } from "@/lib/actions/auth";
import { getAdminStatus } from "@/lib/auth";

export const metadata: Metadata = { title: "Accesso organizzatore" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { errore } = await searchParams;
  const status = await getAdminStatus();
  if (status.status === "admin") redirect("/admin");

  return (
    <main className="flex flex-1 items-center justify-center bg-pine-900 px-4 py-16">
      <Card className="w-full max-w-md">
        <p className="text-center text-5xl" aria-hidden="true">
          🎄
        </p>
        <h1 className="mt-3 text-center font-display text-3xl font-bold text-pine-900">Area organizzatore</h1>
        <p className="mt-2 text-center text-sm text-muted">Accedi con l&apos;account amministratore creato su Supabase.</p>

        <div className="mt-6 space-y-4">
          {status.status === "not_admin" || errore === "non-autorizzato" ? (
            <Alert tone="error" title="Accesso non consentito">
              {status.status === "not_admin" && status.email ? `L'account ${status.email}` : "Questo account"} non è
              un amministratore del Secret Santa.
            </Alert>
          ) : null}
          {errore === "servizio" || status.status === "error" ? (
            <Alert tone="error" title="Servizio non disponibile">
              Non riusciamo a contattare il database. Se il progetto Supabase gratuito è in pausa per inattività,
              riattivalo dalla dashboard di Supabase e riprova.
            </Alert>
          ) : null}

          {status.status === "not_admin" ? (
            <form action={logout}>
              <button type="submit" className={`${buttonClasses("secondary")} w-full`}>
                Esci e accedi con un altro account
              </button>
            </form>
          ) : (
            <LoginForm />
          )}
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="font-medium text-pine-700 underline-offset-4 hover:underline">
            ← Torna alla pagina iniziale
          </Link>
        </p>
      </Card>
    </main>
  );
}
