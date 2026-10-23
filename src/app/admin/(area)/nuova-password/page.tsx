import type { Metadata } from "next";
import Link from "next/link";
import { NewPasswordForm } from "@/components/admin/password-reset-forms";
import { Alert, Card } from "@/components/ui";
import { isRecentRecovery, requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = { title: "Nuova password" };

/** Si arriva qui dal link dell'email di recupero (vedi /auth/confirm). */
export default async function NewPasswordPage() {
  const context = await requireAdminPage();
  const allowed = isRecentRecovery(context);

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="font-display text-3xl font-bold text-pine-900">Scegli una nuova password</h1>
        {context.email ? <p className="mt-2 text-sm text-muted">Account {context.email}</p> : null}
        <div className="mt-6">
          {allowed ? (
            <NewPasswordForm />
          ) : (
            <Alert tone="info" title="Serve il link di recupero">
              Questa pagina funziona solo entro un&apos;ora dall&apos;apertura del link ricevuto per email. Per cambiare la
              password da qui usa la pagina{" "}
              <Link href="/admin/account" className="font-semibold underline">
                Account
              </Link>
              , oppure{" "}
              <Link href="/admin/password-dimenticata" className="font-semibold underline">
                richiedi un nuovo link
              </Link>
              .
            </Alert>
          )}
        </div>
      </Card>
    </div>
  );
}
