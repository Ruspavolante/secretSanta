"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/buttons";
import { Field, inputClasses } from "@/components/ui";
import { login } from "@/lib/actions/auth";

export function LoginForm() {
  return (
    <ActionForm action={login} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} className={inputClasses} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          className={inputClasses}
        />
      </Field>
      <SubmitButton pendingLabel="Accesso in corso…" className="w-full" size="lg">
        Accedi
      </SubmitButton>
    </ActionForm>
  );
}
