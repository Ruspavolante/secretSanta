import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { Alert, Card } from "@/components/ui";
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
        <p className="mt-2 text-center text-sm text-muted">Accedi per gestire i tuoi Secret Santa.</p>

        <div className="mt-6 space-y-4">
          {errore === "servizio" || status.status === "error" ? (
            <Alert tone="error" title="Servizio non disponibile">
              Non riusciamo a contattare il database. Se il progetto Supabase gratuito è in pausa per inattività,
              riattivalo dalla dashboard di Supabase e riprova.
            </Alert>
          ) : null}

          <LoginForm />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Non hai un account?{" "}
          <Link href="/admin/registrati" className="font-semibold text-pine-700 underline-offset-4 hover:underline">
            Creane uno gratis
          </Link>
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href="/" className="font-medium text-pine-700 underline-offset-4 hover:underline">
            ← Torna alla pagina iniziale
          </Link>
        </p>
      </Card>
    </main>
  );
}
