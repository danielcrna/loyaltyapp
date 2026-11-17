import Link from "next/link";
import { requireBusinessUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { config, publicUrl } from "@/lib/config";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PROGRAM_LABELS } from "@/lib/loyalty";
import { Badge, ButtonLink, Card, Notice, PageHeader, Stat } from "@/components/ui";
import { QR } from "@/components/qr";

export const metadata = { title: "Resumen" };

const TX_LABELS: Record<string, string> = {
  WELCOME: "Bienvenida",
  EARN: "Compra",
  VISIT: "Visita",
  REDEEM_REWARD: "Canje",
  REDEEM_CASHBACK: "Monedero",
  COUPON: "Cupón",
  ADJUST: "Ajuste",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ bienvenida?: string }> }) {
  const { bienvenida } = await searchParams;
  const user = await requireBusinessUser();
  const b = user.business;
  const since30 = new Date(Date.now() - 30 * 864e5);

  const [customers, new30, visits30, redeems30, apple, google, activeCoupons, sales30, recent, locations] = await Promise.all([
    db.customer.count({ where: { businessId: b.id } }),
    db.customer.count({ where: { businessId: b.id, createdAt: { gte: since30 } } }),
    db.transaction.count({ where: { businessId: b.id, type: { in: ["EARN", "VISIT"] }, createdAt: { gte: since30 } } }),
    db.transaction.count({
      where: { businessId: b.id, type: { in: ["REDEEM_REWARD", "REDEEM_CASHBACK", "COUPON"] }, createdAt: { gte: since30 } },
    }),
    db.loyaltyCard.count({ where: { businessId: b.id, appleInstalled: true } }),
    db.loyaltyCard.count({ where: { businessId: b.id, googleSaved: true } }),
    db.customerCoupon.count({ where: { promotion: { businessId: b.id }, status: "ACTIVE" } }),
    db.transaction.aggregate({ where: { businessId: b.id, createdAt: { gte: since30 } }, _sum: { purchaseCents: true } }),
    db.transaction.findMany({
      where: { businessId: b.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { card: { include: { customer: true } }, staff: true },
    }),
    db.location.count({ where: { businessId: b.id } }),
  ]);

  const joinUrl = publicUrl(`/n/${b.slug}`);
  const checklist = [
    { done: Boolean(b.logoId), label: "Sube tu logo y elige colores", href: "/dashboard/diseno" },
    { done: locations > 0, label: "Agrega tus sucursales (activa avisos por cercanía)", href: "/dashboard/sucursales" },
    { done: customers > 0, label: "Imprime tu QR e inscribe a tu primer cliente", href: `/n/${b.slug}/cartel` },
  ];

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name.split(" ")[0]}`}
        description={`Programa: ${PROGRAM_LABELS[b.programType]} · ${b.programName}`}
        actions={<ButtonLink href="/escaner">Escanear tarjeta</ButtonLink>}
      />

      {bienvenida && (
        <div className="mb-6">
          <Notice tone="green">
            ¡Bienvenido! Tu programa ya está listo con valores sugeridos. Personalízalo en <Link className="underline" href="/dashboard/programa">Programa</Link> y{" "}
            <Link className="underline" href="/dashboard/diseno">Diseño</Link>.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clientes inscritos" value={customers.toLocaleString("es-MX")} hint={`+${new30} en 30 días`} />
        <Stat label="Visitas (30 días)" value={visits30.toLocaleString("es-MX")} hint={`Ventas registradas: ${formatMoney(sales30._sum.purchaseCents ?? 0, b.currency)}`} />
        <Stat label="Canjes (30 días)" value={redeems30.toLocaleString("es-MX")} hint={`${activeCoupons} cupones activos`} />
        <Stat label="Tarjetas en wallet" value={(apple + google).toLocaleString("es-MX")} hint={`Apple ${apple} · Google ${google}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Tu QR de inscripción" className="lg:col-span-1">
          <div className="flex flex-col items-center gap-3 text-center">
            <QR value={joinUrl} size={180} />
            <p className="break-all text-xs text-stone-500">{joinUrl}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href={`/n/${b.slug}/cartel`} variant="secondary" target="_blank">
                Imprimir cartel
              </ButtonLink>
              <ButtonLink href={`/n/${b.slug}`} variant="ghost" target="_blank">
                Ver página
              </ButtonLink>
            </div>
          </div>
        </Card>

        <Card title="Actividad reciente" className="lg:col-span-2">
          {recent.length === 0 ? (
            <p className="text-sm text-stone-500">Aún no hay movimientos. Escanea la tarjeta de un cliente para registrar su primera visita.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/dashboard/clientes/${t.card.customerId}`} className="font-medium hover:underline">
                      {t.card.customer.name}
                    </Link>
                    <div className="truncate text-xs text-stone-500">
                      {t.description} {t.staff ? `· ${t.staff.name}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={t.type.startsWith("REDEEM") || t.type === "COUPON" ? "amber" : "green"}>{TX_LABELS[t.type]}</Badge>
                    <div className="mt-0.5 text-xs text-stone-500">{formatDateTime(t.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Primeros pasos">
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-3 text-sm">
                <span className={c.done ? "text-emerald-600" : "text-stone-300"}>{c.done ? "✔" : "○"}</span>
                <Link href={c.href} className={c.done ? "text-stone-500 line-through" : "font-medium hover:underline"}>
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Estado de billeteras digitales">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              Apple Wallet {config.apple.enabled ? <Badge tone="green">Activo</Badge> : <Badge tone="amber">Pendiente de configurar</Badge>}
            </li>
            <li className="flex justify-between">
              Google Wallet {config.google.enabled ? <Badge tone="green">Activo</Badge> : <Badge tone="amber">Pendiente de configurar</Badge>}
            </li>
          </ul>
          {(!config.apple.enabled || !config.google.enabled) && (
            <p className="mt-3 text-xs text-stone-500">
              Mientras tanto, tus clientes reciben una tarjeta web con QR que funciona igual en el escáner.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
