import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasActiveAccess } from "@/lib/billing";
import { Scanner } from "@/components/scanner";
import { SwRegister } from "@/components/sw-register";

export const metadata = { title: "Escáner" };

export default async function ScannerPage() {
  const user = await requireUser();
  if (!user.business) redirect("/login");
  const b = user.business;
  const [rewards, locations] = await Promise.all([
    db.reward.findMany({ where: { businessId: b.id, active: true }, orderBy: { pointsCost: "asc" } }),
    db.location.findMany({ where: { businessId: b.id, active: true }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="min-h-screen bg-stone-100">
      <SwRegister />
      <header className="flex items-center justify-between gap-3 bg-white px-4 py-2 shadow-sm">
        <div className="min-w-0">
          <h1 className="truncate font-bold">{b.name}</h1>
          <div className="truncate text-sm text-stone-600">{user.name}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm">
          {user.role !== "STAFF" && (
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            >
              Panel
            </Link>
          )}
          <form action="/logout" method="post">
            <button className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3 font-semibold text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {!hasActiveAccess(b) && (
          <p className="mx-auto mb-4 max-w-md rounded-xl bg-red-100 p-3 text-center text-sm text-red-800">
            La suscripción del negocio no está activa: no se pueden registrar movimientos.
          </p>
        )}
        <Scanner
          program={{ type: b.programType, stampReward: b.stampReward, stampMinPurchase: b.stampMinPurchase, currency: b.currency }}
          rewards={rewards.map((r) => ({ id: r.id, name: r.name, pointsCost: r.pointsCost }))}
          locations={locations}
          canTransact={hasActiveAccess(b)}
        />
      </main>
    </div>
  );
}
