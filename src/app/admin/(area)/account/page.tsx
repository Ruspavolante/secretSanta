import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm, DeleteAccountForm } from "@/components/admin/account-forms";
import { Card, SectionTitle } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = { title: "Il tuo account" };

export default async function AccountPage() {
  const { email } = await requireAdminPage();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link href="/admin" className="text-sm font-medium text-pine-700 underline-offset-4 hover:underline">
          ← I tuoi eventi
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold text-pine-900 sm:text-4xl">Il tuo account</h1>
        {email ? <p className="mt-2 text-sm text-muted">Accesso con {email}</p> : null}
      </div>

      <Card>
        <SectionTitle icon="🔑" title="Cambia password" />
        <ChangePasswordForm />
      </Card>

      {email ? (
        <Card>
          <SectionTitle
            icon="⚠️"
            title="Elimina account"
            description="Cancella definitivamente l'account e tutti i tuoi eventi, con partecipanti, foto, esclusioni e abbinamenti. I link già inviati smetteranno di funzionare."
          />
          <DeleteAccountForm email={email} />
        </Card>
      ) : null}
    </div>
  );
}
