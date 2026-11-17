import Link from "next/link";
import { requireBusinessUser } from "@/lib/auth";
import { hasActiveAccess, trialDaysLeft } from "@/lib/billing";
import { DashboardNav } from "@/components/dashboard-nav";
import { config } from "@/lib/config";
import { brandFor } from "@/lib/plans";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireBusinessUser(["OWNER", "MANAGER"]);
  const b = user.business;
  const active = hasActiveAccess(b);
  const days = trialDaysLeft(b);
  return (
    <div className="min-h-screen">
      <DashboardNav
        isOwner={user.role === "OWNER"}
        businessName={b.name}
        userName={user.name}
        appName={config.appName}
        brandLogoUrl={brandFor(b).logoUrl}
      />
      <div className="lg:pl-64">
        {!active ? (
          <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
            Tu suscripción no está activa. Tus clientes no podrán sumar ni canjear.{" "}
            <Link href="/dashboard/facturacion" className="font-semibold underline">
              Activar plan
            </Link>
          </div>
        ) : b.subscriptionStatus === "TRIALING" && b.trialEndsAt ? (
          <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
            Periodo de prueba: te quedan {days} día{days === 1 ? "" : "s"}.{" "}
            <Link href="/dashboard/facturacion" className="font-semibold underline">
              Elegir plan
            </Link>
          </div>
        ) : null}
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
