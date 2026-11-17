import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 shadow-sm",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  ghost: "text-stone-700 hover:bg-stone-100",
};
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn(btnBase, variants[variant], className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  className,
  children,
  ...rest
}: { href: string; variant?: Variant; className?: string; children: ReactNode; target?: string; download?: boolean | string; prefetch?: boolean }) {
  const external = href.startsWith("http") || href.startsWith("/api/");
  if (external)
    return (
      <a href={href} className={cn(btnBase, variants[variant], className)} {...rest}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={cn(btnBase, variants[variant], className)} {...rest}>
      {children}
    </Link>
  );
}

const fieldBase =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-stone-100";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-24", className)} {...props} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-stone-700">
      <input type="checkbox" className="mt-0.5 size-4 rounded border-stone-300 accent-brand-600" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-stone-200 bg-white p-5 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-stone-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "green" | "amber" | "red" | "blue" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-sky-100 text-sky-800",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-stone-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
      <p className="font-semibold text-stone-800">{title}</p>
      {children && <div className="mt-2 text-sm text-stone-600">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "blue" | "green" | "red"; children: ReactNode }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-sky-200 bg-sky-50 text-sky-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}
