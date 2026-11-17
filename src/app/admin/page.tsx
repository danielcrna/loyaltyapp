import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { STATUS_LABELS } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { PLANS, getPlan } from "@/lib/plans";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { updateBusinessAdminAction } from "./actions";

export const metadata = { title: "Superadmin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSuperAdmin();
  const { q = "" } = await searchParams;
  const businesses = await db.business.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { customers: true, locations: true, users: true } } },
    take: 200,
  });
  const [total, active, trialing, customers, paying] = await Promise.all([
    db.business.count(),
    db.business.count({ where: { subscriptionStatus: "ACTIVE" } }),
    db.business.count({ where: { subscriptionStatus: "TRIALING" } }),
    db.customer.count(),
    db.business.findMany({ where: { subscriptionStatus: "ACTIVE" }, select: { plan: true } }),
  ]);
  const mrr = paying.reduce((s, b) => s + getPlan(b.plan).priceMonthly, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        title={`${config.appName} · Superadmin`}
        description="Negocios suscritos a la plataforma"
        actions={
          <form action="/logout" method="post">
            <button className="text-sm text-stone-600">Cerrar sesión</button>
          </form>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Negocios" value={total} />
        <Stat label="Activos (pagando)" value={active} />
        <Stat label="En prueba" value={trialing} />
        <Stat label="MRR estimado" value={`$${mrr.toLocaleString("es-MX")}`} hint="MXN, según precios de lista" />
        <Stat label="Clientes finales" value={customers.toLocaleString("es-MX")} />
      </div>
      <Card>
        <form className="mb-4 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar negocio o correo" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white">Buscar</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500 uppercase">
              <tr>
                <th className="py-2">Negocio</th>
                <th>Clientes</th>
                <th>Suc.</th>
                <th>Estado</th>
                <th>Alta</th>
                <th>Gestionar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td className="py-3">
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-stone-500">
                      {b.email} ·{" "}
                      <Link href={`/n/${b.slug}`} className="underline" target="_blank">
                        /n/{b.slug}
                      </Link>
                    </div>
                  </td>
                  <td>{b._count.customers}</td>
                  <td>{b._count.locations}</td>
                  <td>
                    <Badge tone={b.subscriptionStatus === "ACTIVE" ? "green" : b.subscriptionStatus === "TRIALING" ? "amber" : "red"}>
                      {STATUS_LABELS[b.subscriptionStatus]}
                    </Badge>
                    <div className="text-xs text-stone-500">
                      {getPlan(b.plan).name}
                      {b.subscriptionStatus === "TRIALING" && b.trialEndsAt && ` · hasta ${formatDate(b.trialEndsAt)}`}
                    </div>
                  </td>
                  <td className="text-xs text-stone-500">{formatDate(b.createdAt)}</td>
                  <td>
                    <form action={updateBusinessAdminAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="id" value={b.id} />
                      <select name="plan" defaultValue={b.plan} className="rounded border border-stone-300 px-1 py-1 text-xs">
                        {PLANS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <select name="status" defaultValue={b.subscriptionStatus} className="rounded border border-stone-300 px-1 py-1 text-xs">
                        {Object.entries(STATUS_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <input
                        name="extendTrial"
                        type="number"
                        min={0}
                        placeholder="+días prueba"
                        className="w-24 rounded border border-stone-300 px-1 py-1 text-xs"
                      />
                      <button className="rounded bg-stone-900 px-2 py-1 text-xs font-semibold text-white">Guardar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
