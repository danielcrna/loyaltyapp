"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/format";

const ITEMS = [
  { href: "/dashboard", label: "Resumen", icon: "◎" },
  { href: "/dashboard/clientes", label: "Clientes", icon: "☺" },
  { href: "/dashboard/programa", label: "Programa", icon: "★" },
  { href: "/dashboard/diseno", label: "Diseño de tarjeta", icon: "▣" },
  { href: "/dashboard/promociones", label: "Cupones y promos", icon: "%" },
  { href: "/dashboard/notificaciones", label: "Notificaciones", icon: "✉" },
  { href: "/dashboard/sucursales", label: "Sucursales", icon: "⌖" },
  { href: "/dashboard/equipo", label: "Equipo", icon: "☷", ownerOnly: true },
  { href: "/dashboard/facturacion", label: "Plan y pagos", icon: "$", ownerOnly: true },
];

export function DashboardNav({
  isOwner,
  businessName,
  userName,
  appName,
  brandLogoUrl,
}: {
  isOwner: boolean;
  businessName: string;
  userName: string;
  appName: string;
  brandLogoUrl: string | null; // marca blanca (plan Empresarial)
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = ITEMS.filter((i) => !i.ownerOnly || isOwner);
  const links = (
    <nav className="space-y-1">
      {items.map((i) => {
        const active = i.href === "/dashboard" ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              active ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100",
            )}
          >
            <span className="w-5 text-center" aria-hidden>
              {i.icon}
            </span>
            {i.label}
          </Link>
        );
      })}
      <Link
        href="/escaner"
        className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
      >
        ⧉ Abrir escáner
      </Link>
    </nav>
  );
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 lg:hidden">
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandLogoUrl} alt={businessName} className="h-8 max-w-[160px] object-contain" />
        ) : (
          <span className="truncate font-semibold">{businessName}</span>
        )}
        <button onClick={() => setOpen(!open)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm" aria-expanded={open}>
          Menú
        </button>
      </header>
      {open && <div className="border-b border-stone-200 bg-white p-4 lg:hidden">{links}</div>}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-stone-200 bg-white p-4 lg:flex">
        <div className="mb-6 px-2">
          {brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandLogoUrl} alt={businessName} className="mb-2 h-12 max-w-[200px] object-contain" />
          ) : (
            <div className="mb-3 flex items-center gap-1.5 text-xs font-bold text-brand-700">
              <span className="grid size-5 place-items-center rounded-md bg-brand-600 text-[10px] text-white">★</span>
              {appName}
            </div>
          )}
          <div className="truncate text-lg font-bold">{businessName}</div>
          <div className="truncate text-xs text-stone-500">{userName}</div>
        </div>
        {links}
        <form action="/logout" method="post" className="mt-auto">
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-100">Cerrar sesión</button>
        </form>
      </aside>
    </>
  );
}
