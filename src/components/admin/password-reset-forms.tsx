"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/buttons";
import { Field, inputClasses } from "@/components/ui";
import { requestPasswordReset, setNewPassword } from "@/lib/actions/account";
import { LIMITS } from "@/lib/validation";

export function PasswordResetRequestForm() {
  return (
    <ActionForm action={requestPasswordReset} className="space-y-4" testId="password-reset-form">
      <Field label="Email del tuo account" htmlFor="reset-email">
        <input id="reset-email" name="email" type="email" autoComplete="email" required maxLength={254} className={inputClasses} />
      </Field>
      <SubmitButton pendingLabel="Invio…" className="w-full" size="lg">
        Mandami il link
      </SubmitButton>
    </ActionForm>
  );
}

export function NewPasswordForm() {
  return (
    <ActionForm action={setNewPassword} className="space-y-4" testId="new-password-form">
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
      <Field label="Ripeti la nuova password" htmlFor="new-password-confirm">
        <input
          id="new-password-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={LIMITS.passwordMin}
          maxLength={LIMITS.passwordMax}
          className={inputClasses}
        />
      </Field>
      <SubmitButton pendingLabel="Salvataggio…" className="w-full" size="lg">
        Salva la nuova password
      </SubmitButton>
    </ActionForm>
  );
}
