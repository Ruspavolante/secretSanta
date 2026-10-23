"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/buttons";
import { Field, inputClasses } from "@/components/ui";
import { changePassword, deleteAccount } from "@/lib/actions/account";
import { LIMITS } from "@/lib/validation";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePassword} resetOnSuccess className="space-y-4" testId="change-password-form">
      <Field label="Password attuale" htmlFor="current-password">
        <input id="current-password" name="current" type="password" autoComplete="current-password" required maxLength={200} className={inputClasses} />
      </Field>
      <Field label="Nuova password" htmlFor="new-password" hint={`Almeno ${LIMITS.passwordMin} caratteri.`}>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={LIMITS.passwordMin}
          maxLength={LIMITS.passwordMax}
          className={inputClasses}
        />
      </Field>
      <Field label="Ripeti la nuova password" htmlFor="confirm-password">
        <input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={LIMITS.passwordMin}
          maxLength={LIMITS.passwordMax}
          className={inputClasses}
        />
      </Field>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Salvataggio…">
        Cambia password
      </SubmitButton>
    </ActionForm>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  return (
    <ActionForm action={deleteAccount} className="space-y-4" testId="delete-account-form">
      <Field label={`Per confermare scrivi la tua email (${email})`} htmlFor="delete-confirmation">
        <input id="delete-confirmation" name="confirmation" type="email" autoComplete="off" required maxLength={254} className={inputClasses} />
      </Field>
      <SubmitButton variant="danger" size="sm" pendingLabel="Eliminazione…">
        <span aria-hidden="true">🗑️</span> Elimina account ed eventi
      </SubmitButton>
    </ActionForm>
  );
}
