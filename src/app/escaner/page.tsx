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
      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="font-bold">{b.name}</div>
          <div className="text-xs text-stone-500">{user.name}</div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user.role !== "STAFF" && (
            <Link href="/dashboard" className="font-semibold text-brand-700">
              Panel
            </Link>
          )}
          <form action="/logout" method="post">
            <button className="text-stone-500">Salir</button>
          </form>
        </div>
      </header>
      <main className="px-4 py-6">
        {!hasActiveAccess(b) && (
          <p className="mx-auto mb-4 max-w-md rounded-xl bg-red-100 p-3 text-center text-sm text-red-800">
            La suscripción del negocio no está activa: no se pueden registrar movimientos.
          </p>
        )}
        <Scanner
          program={{ type: b.programType, stampReward: b.stampReward, stampMinPurchase: b.stampMinPurchase, currency: b.currency }}
          rewards={rewards.map((r) => ({ id: r.id, name: r.name, pointsCost: r.pointsCost }))}
          locations={locations}
        />
      </main>
    </div>
  );
}
