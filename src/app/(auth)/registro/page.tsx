import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui";
import { config } from "@/lib/config";
import { signupAction } from "../actions";

export const metadata = { title: "Registra tu negocio" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Crea tu programa de lealtad</h1>
      <p className="mb-6 text-sm text-stone-600">{config.trialDays} días de prueba gratis. Sin tarjeta de crédito.</p>
      <ActionForm action={signupAction}>
        <Field label="Nombre del negocio">
          <Input name="businessName" placeholder="Café La Esquina" required />
        </Field>
        <Field label="Tipo de negocio">
          <Select name="category" defaultValue="cafeteria">
            <option value="cafeteria">Cafetería</option>
            <option value="restaurante">Restaurante</option>
            <option value="panaderia">Panadería / Pastelería</option>
            <option value="bar">Bar</option>
            <option value="heladeria">Heladería / Postres</option>
            <option value="otro">Otro</option>
          </Select>
        </Field>
        <Field label="Tu nombre">
          <Input name="name" autoComplete="name" required />
        </Field>
        <Field label="Correo">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Checkbox
          name="terms"
          required
          label={
            <>
              Acepto los <Link href="/terminos" className="text-brand-700 underline">términos</Link> y el{" "}
              <Link href="/privacidad" className="text-brand-700 underline">aviso de privacidad</Link>.
            </>
          }
        />
        <SubmitButton className="w-full">Crear cuenta</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-stone-600">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-brand-700">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
