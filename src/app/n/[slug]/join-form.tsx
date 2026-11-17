"use client";

import { ActionForm, SubmitButton, type ActionResult } from "@/components/action-form";
import { Checkbox, Field, Input } from "@/components/ui";

export function JoinForm({
  action,
  askPhone,
  askEmail,
  askBirthday,
  businessName,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  askPhone: boolean;
  askEmail: boolean;
  askBirthday: boolean;
  businessName: string;
}) {
  return (
    <ActionForm action={action}>
      <Field label="Nombre">
        <Input name="name" autoComplete="name" required />
      </Field>
      {askPhone && (
        <Field label="Teléfono / WhatsApp">
          <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" required />
        </Field>
      )}
      {askEmail && (
        <Field label={askPhone ? "Correo (opcional)" : "Correo"}>
          <Input name="email" type="email" autoComplete="email" required={!askPhone} />
        </Field>
      )}
      {askBirthday && (
        <Field label="Cumpleaños (opcional)" hint="Para enviarte un regalo en tu día">
          <Input name="birthday" type="date" />
        </Field>
      )}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Checkbox
        name="privacy"
        required
        label={
          <>
            Acepto el{" "}
            <a href="/privacidad" target="_blank" className="underline">
              aviso de privacidad
            </a>
            .
          </>
        }
      />
      <Checkbox name="marketing" defaultChecked label={`Quiero recibir promociones de ${businessName}.`} />
      <SubmitButton className="w-full py-3 text-base">Obtener mi tarjeta</SubmitButton>
    </ActionForm>
  );
}
