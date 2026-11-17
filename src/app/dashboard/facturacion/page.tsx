import { requireBusinessUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { STATUS_LABELS, trialDaysLeft } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { PLANS, getPlan } from "@/lib/plans";
import { Badge, Button, Card, Notice, PageHeader } from "@/components/ui";
import { checkoutAction, portalAction } from "./actions";

export const metadata = { title: "Plan y pagos" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const { business: b } = await requireBusinessUser(["OWNER"]);
  const current = getPlan(b.plan);
  const subscribed = Boolean(b.stripeSubscriptionId) && b.subscriptionStatus !== "CANCELED";
  return (
    <>
      <PageHeader title="Plan y pagos" description="Administra tu suscripción. Los cobros se procesan de forma segura con Stripe." />
      {estado === "ok" && <div className="mb-4"><Notice tone="green">¡Gracias! Tu suscripción se activará en unos segundos.</Notice></div>}
      {estado === "sin-stripe" && <div className="mb-4"><Notice>Los pagos aún no están configurados en la plataforma (falta STRIPE_SECRET_KEY).</Notice></div>}

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-stone-500">Plan actual</div>
            <div className="text-xl font-bold">
              {current.name} <Badge tone={b.subscriptionStatus === "ACTIVE" ? "green" : "amber"}>{STATUS_LABELS[b.subscriptionStatus]}</Badge>
            </div>
            <div className="text-sm text-stone-600">
              {b.subscriptionStatus === "TRIALING" && b.trialEndsAt && `Prueba hasta ${formatDate(b.trialEndsAt)} (${trialDaysLeft(b)} días)`}
              {b.currentPeriodEnd && b.subscriptionStatus !== "TRIALING" && `Próxima renovación: ${formatDate(b.currentPeriodEnd)}`}
            </div>
          </div>
          {subscribed && (
            <form action={portalAction}>
              <Button variant="secondary">Administrar pago y facturas</Button>
            </form>
          )}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.id} className={p.id === current.id ? "ring-2 ring-brand-500" : ""}>
            <h3 className="text-lg font-bold">{p.name}</h3>
            <div className="my-2 text-3xl font-bold">
              ${p.priceMonthly.toLocaleString("es-MX")}
              <span className="text-sm font-normal text-stone-500"> MXN/mes</span>
            </div>
            <ul className="mb-4 space-y-1 text-sm text-stone-700">
              {p.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            {subscribed ? (
              p.id === current.id ? (
                <Badge tone="green">Tu plan</Badge>
              ) : (
                <form action={portalAction}>
                  <Button variant="secondary" className="w-full">Cambiar a {p.name}</Button>
                </form>
              )
            ) : (
              <form action={checkoutAction}>
                <input type="hidden" name="plan" value={p.id} />
                <Button className="w-full" disabled={!config.stripe.enabled}>
                  Suscribirme
                </Button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
