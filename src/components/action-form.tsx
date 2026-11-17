"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/format";

export type ActionResult = { ok?: boolean; error?: string; message?: string } | null;

/**
 * Formulario conectado a una server action con mensajes de éxito/error.
 * La acción recibe (prevState, formData) y devuelve ActionResult.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={cn("space-y-4", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && state.message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "bg-white text-stone-800 border border-stone-300 hover:bg-stone-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-60",
        styles[variant],
        className,
      )}
    >
      {pending ? "Procesando…" : children}
    </button>
  );
}
