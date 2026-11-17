import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { isPromotionLive } from "@/lib/services";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, ButtonLink, Card, Checkbox, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { CardView } from "@/components/card-view";
import { QR } from "@/components/qr";
import { publicUrl } from "@/lib/config";
import { adjustAction, deleteCustomerAction, giveCouponAction, messageCustomerAction, updateCustomerAction } from "../actions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireBusinessUser();
  const b = user.business;
  const customer = await db.customer.findFirst({
    where: { id, businessId: b.id },
    include: {
      card: { include: { transactions: { orderBy: { createdAt: "desc" }, take: 50, include: { staff: true, location: true } } } },
      coupons: { include: { promotion: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) notFound();
  const promos = (await db.promotion.findMany({ where: { businessId: b.id, active: true } })).filter((p) => isPromotionLive(p));
  const card = customer.card;
  const unit = b.programType === "POINTS" ? "puntos" : b.programType === "CASHBACK" ? "pesos" : "sellos";
  const fmtDelta = (t: NonNullable<typeof card>["transactions"][number]) => {
    const parts = [];
    if (t.pointsDelta) parts.push(`${t.pointsDelta > 0 ? "+" : ""}${t.pointsDelta} pts`);
    if (t.cashbackDelta) parts.push(`${t.cashbackDelta > 0 ? "+" : "-"}${formatMoney(Math.abs(t.cashbackDelta), b.currency)}`);
    if (t.stampsDelta || t.rewardsDelta)
      parts.push(`${t.stampsDelta > 0 ? "+" : ""}${t.stampsDelta} sellos${t.rewardsDelta ? `, ${t.rewardsDelta > 0 ? "+" : ""}${t.rewardsDelta} recompensa` : ""}`);
    return parts.join(" · ") || "—";
  };

  return (
    <>
      <PageHeader
        title={customer.name}
        description={
          <>
            Cliente desde {formatDate(customer.createdAt)} · <Link href="/dashboard/clientes" className="underline">Volver</Link>
          </>
        }
        actions={card && <ButtonLink href={`/tarjeta/${card.serial}`} variant="secondary" target="_blank">Ver tarjeta del cliente</ButtonLink>}
      />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          {card && <CardView business={b} card={card} customerName={customer.name} />}
          {card && (
            <Card title="Resumen">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-stone-500">Visitas</dt>
                <dd>{card.visits}</dd>
                <dt className="text-stone-500">Consumo total</dt>
                <dd>{formatMoney(card.totalSpentCents, b.currency)}</dd>
                <dt className="text-stone-500">Última visita</dt>
                <dd>{formatDate(card.lastVisitAt)}</dd>
                <dt className="text-stone-500">Wallet</dt>
                <dd className="space-x-1">
                  {card.appleInstalled ? <Badge>Apple</Badge> : null}
                  {card.googleSaved ? <Badge tone="blue">Google</Badge> : null}
                  {!card.appleInstalled && !card.googleSaved && "Solo web"}
                </dd>
                <dt className="text-stone-500">Código</dt>
                <dd className="font-mono text-xs">{card.serial}</dd>
              </dl>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-brand-700">QR para que el cliente recupere su tarjeta</summary>
                <div className="mt-3 flex flex-col items-center gap-2 text-center">
                  <QR value={publicUrl(`/tarjeta/${card.serial}`)} size={170} />
                  <p className="text-xs text-stone-500">Pide al cliente que lo escanee con la cámara de su celular para abrir y volver a guardar su tarjeta.</p>
                </div>
              </details>
            </Card>
          )}
          <Card title="Datos de contacto">
            <ActionForm action={updateCustomerAction}>
              <input type="hidden" name="id" value={customer.id} />
              <Field label="Nombre">
                <Input name="name" defaultValue={customer.name} />
              </Field>
              <Field label="Teléfono">
                <Input name="phone" defaultValue={customer.phone ?? ""} />
              </Field>
              <Field label="Correo">
                <Input name="email" type="email" defaultValue={customer.email ?? ""} />
              </Field>
              <Field label="Cumpleaños">
                <Input name="birthday" type="date" defaultValue={customer.birthday ? customer.birthday.toISOString().slice(0, 10) : ""} />
              </Field>
              <Field label="Notas internas">
                <Textarea name="notes" defaultValue={customer.notes} />
              </Field>
              <Checkbox name="consent" defaultChecked={customer.marketingConsent} label="Acepta recibir promociones" />
              <SubmitButton variant="secondary">Guardar</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Ajuste manual">
              <ActionForm action={adjustAction} resetOnSuccess>
                <input type="hidden" name="id" value={customer.id} />
                <div className="flex gap-2">
                  <Select name="sign" className="w-28">
                    <option value="plus">Sumar</option>
                    <option value="minus">Restar</option>
                  </Select>
                  <Input name="amount" inputMode="decimal" placeholder={`Cantidad de ${unit}`} required />
                </div>
                <Input name="note" placeholder="Motivo (opcional)" />
                <SubmitButton variant="secondary">Aplicar</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="Enviar mensaje a su tarjeta">
              <ActionForm action={messageCustomerAction} resetOnSuccess>
                <input type="hidden" name="id" value={customer.id} />
                <Textarea name="message" maxLength={240} placeholder="¡Gracias por tu visita! Te esperamos pronto." required />
                <SubmitButton variant="secondary">Enviar</SubmitButton>
              </ActionForm>
            </Card>
          </div>

          <Card title="Cupones">
            {customer.coupons.length > 0 && (
              <ul className="mb-4 divide-y divide-stone-100 text-sm">
                {customer.coupons.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <span>
                      {c.promotion.title} <span className="font-mono text-xs text-stone-400">{c.code}</span>
                    </span>
                    <Badge tone={c.status === "ACTIVE" ? "green" : c.status === "REDEEMED" ? "blue" : "stone"}>
                      {c.status === "ACTIVE" ? "Activo" : c.status === "REDEEMED" ? `Canjeado ${formatDate(c.redeemedAt)}` : "Vencido"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {promos.length > 0 ? (
              <ActionForm action={giveCouponAction} className="flex gap-2 space-y-0">
                <input type="hidden" name="id" value={customer.id} />
                <Select name="promotionId">
                  {promos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </Select>
                <SubmitButton variant="secondary" className="shrink-0">Regalar cupón</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-stone-500">Crea una promoción vigente para poder regalar cupones.</p>
            )}
          </Card>

          <Card title="Historial">
            {!card || card.transactions.length === 0 ? (
              <p className="text-sm text-stone-500">Sin movimientos.</p>
            ) : (
              <ul className="divide-y divide-stone-100 text-sm">
                {card.transactions.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3 py-2">
                    <div>
                      <div className="font-medium">{t.description}</div>
                      <div className="text-xs text-stone-500">
                        {formatDateTime(t.createdAt)}
                        {t.staff && ` · ${t.staff.name}`}
                        {t.location && ` · ${t.location.name}`}
                        {t.purchaseCents > 0 && ` · compra ${formatMoney(t.purchaseCents, b.currency)}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs font-semibold">{fmtDelta(t)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {user.role === "OWNER" && (
            <Card title="Zona de privacidad">
              <p className="mb-3 text-sm text-stone-600">
                Si el cliente ejerce su derecho de cancelación (LFPDPPP), elimina definitivamente sus datos, tarjeta e historial.
              </p>
              <form action={deleteCustomerAction}>
                <input type="hidden" name="id" value={customer.id} />
                <button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                  Eliminar cliente y sus datos
                </button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
