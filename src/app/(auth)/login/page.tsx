import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { loginAction } from "../actions";

export const metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Inicia sesión</h1>
      <p className="mb-6 text-sm text-stone-600">Panel para negocios y personal de mostrador.</p>
      <ActionForm action={loginAction}>
        <Field label="Correo">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Contraseña">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="w-full">Entrar</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-stone-600">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-semibold text-brand-700">
          Registra tu negocio
        </Link>
      </p>
    </>
  );
}
