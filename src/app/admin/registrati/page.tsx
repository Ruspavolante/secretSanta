import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/admin/register-form";
import { Card } from "@/components/ui";
import { getAdminStatus } from "@/lib/auth";

export const metadata: Metadata = { title: "Crea un account" };

export default async function RegisterPage() {
  const status = await getAdminStatus();
  if (status.status === "admin") redirect("/admin");

  return (
    <main className="flex flex-1 items-center justify-center bg-pine-900 px-4 py-16">
      <Card className="w-full max-w-md">
        <p className="text-center text-5xl" aria-hidden="true">
          🎅
        </p>
        <h1 className="mt-3 text-center font-display text-3xl font-bold text-pine-900">Crea il tuo account</h1>
        <p className="mt-2 text-center text-sm text-muted">
          Gratis. Con il tuo account organizzi i tuoi Secret Santa: nessun altro vede i tuoi eventi.
        </p>

        <div className="mt-6">
          <RegisterForm />
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Conserva bene la password: per ora non c&apos;è il recupero via email.
        </p>
        <p className="mt-6 text-center text-sm text-muted">
          Hai già un account?{" "}
          <Link href="/admin/login" className="font-semibold text-pine-700 underline-offset-4 hover:underline">
            Accedi
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
