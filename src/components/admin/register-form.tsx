"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/buttons";
import { Field, inputClasses } from "@/components/ui";
import { registerOrganizer } from "@/lib/actions/auth";
import { LIMITS } from "@/lib/validation";

export function RegisterForm() {
  return (
    <ActionForm action={registerOrganizer} className="space-y-4" testId="register-form">
      <Field label="Email" htmlFor="register-email">
        <input id="register-email" name="email" type="email" autoComplete="email" required maxLength={254} className={inputClasses} />
      </Field>
      <Field label="Password" htmlFor="register-password" hint={`Almeno ${LIMITS.passwordMin} caratteri.`}>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={LIMITS.passwordMin}
          maxLength={LIMITS.passwordMax}
          className={inputClasses}
        />
      </Field>
      <Field label="Ripeti la password" htmlFor="register-confirm">
        <input
          id="register-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={LIMITS.passwordMin}
          maxLength={LIMITS.passwordMax}
          className={inputClasses}
        />
      </Field>
      <SubmitButton pendingLabel="Creazione dell'account…" className="w-full" size="lg">
        Crea l&apos;account
      </SubmitButton>
    </ActionForm>
  );
}
