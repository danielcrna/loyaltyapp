import { requireBusinessUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { isPromotionLive } from "@/lib/services";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, ButtonLink, Card, Checkbox, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import {
  createPromotionAction,
  revokePromotionCouponsAction,
  sendPromotionAction,
  togglePromotionAction,
  updateClaimAction,
} from "./actions";
import { QR } from "@/components/qr";
import { publicUrl } from "@/lib/config";

export const metadata = { title: "Cupones y promociones" };

const AUTO_LABELS = {
  NONE: "Manual / envío masivo",
  NEW_MEMBERS: "Al inscribirse",
  BIRTHDAY: "En su cumpleaños",
  WINBACK: "Recordatorio de inactividad",
} as const;

export default async function PromotionsPage() {
  const { business: b } = await requireBusinessUser();
  const promos = await db.promotion.findMany({ where: { businessId: b.id }, orderBy: { createdAt: "desc" } });
  const stats = await db.customerCoupon.groupBy({
    by: ["promotionId", "status", "source"],
    where: { promotion: { businessId: b.id } },
    _count: true,
  });
  const count = (id: string, status?: string) =>
    stats.filter((s) => s.promotionId === id && (!status || s.status === status)).reduce((a, s) => a + s._count, 0);
  const qrClaims = (id: string) =>
    stats.filter((s) => s.promotionId === id && s.source === "qr" && s.status !== "VOID").reduce((a, s) => a + s._count, 0);

  return (
    <>
      <PageHeader
        title="Cupones y promociones"
        description="Crea promociones y entrégalas como cupones con QR que tus clientes pueden guardar en su wallet y canjear en caja."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {promos.length === 0 && <EmptyState title="Sin promociones">Crea tu primera promoción, por ejemplo “2x1 en capuchinos los martes”.</EmptyState>}
          {promos.map((p) => {
            const live = isPromotionLive(p);
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    {p.imageId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${p.imageId}`} alt="" className="size-16 rounded-lg object-cover" />
                    )}
                    <div>
                      <h3 className="font-semibold">
                        {p.discountLabel && <span className="mr-2 rounded bg-brand-100 px-1.5 text-brand-700">{p.discountLabel}</span>}
                        {p.title}
                      </h3>
                      <p className="text-sm text-stone-600">{p.description}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-stone-500">
                        {live ? <Badge tone="green">Vigente</Badge> : <Badge>{p.active ? "Fuera de fechas" : "Pausada"}</Badge>}
                        <Badge tone="blue">{AUTO_LABELS[p.autoAssign]}</Badge>
                        {p.startsAt && <span>Desde {formatDate(p.startsAt)}</span>}
                        {p.endsAt && <span>Hasta {formatDate(p.endsAt)}</span>}
                        {p.validDays && <span>Vigencia {p.validDays} días</span>}
                      </div>
                      <p className="mt-2 text-xs text-stone-600">
                        Entregados: <strong>{count(p.id)}</strong> · Canjeados: <strong>{count(p.id, "REDEEMED")}</strong> · Activos:{" "}
                        <strong>{count(p.id, "ACTIVE")}</strong>
                        {count(p.id, "VOID") > 0 && (
                          <>
                            {" "}
                            · Revocados: <strong>{count(p.id, "VOID")}</strong>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <form action={togglePromotionAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold">{p.active ? "Pausar" : "Activar"}</button>
                  </form>
                </div>
                <div className="mt-4 rounded-xl border border-stone-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      QR para reclamar {p.claimEnabled ? <Badge tone="green">Activo</Badge> : <Badge>Desactivado</Badge>}
                    </span>
                    <form action={updateClaimAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button name="op" value={p.claimEnabled ? "disable" : "enable"} className="text-xs font-semibold text-brand-700">
                        {p.claimEnabled ? "Desactivar QR" : "Activar QR"}
                      </button>
                    </form>
                  </div>
                  {p.claimEnabled && p.claimToken && (
                    <div className="mt-3 flex flex-wrap items-start gap-4">
                      <QR value={publicUrl(`/promo/${p.claimToken}`)} size={120} />
                      <div className="min-w-0 flex-1 space-y-2 text-xs text-stone-600">
                        <p>
                          Tus clientes escanean este QR y el cupón se agrega a su tarjeta. Los nuevos se inscriben y lo reciben al mismo tiempo.
                        </p>
                        <p className="break-all font-mono text-stone-500">{publicUrl(`/promo/${p.claimToken}`)}</p>
                        <p>
                          Reclamados por QR: <strong>{qrClaims(p.id)}</strong>
                          {p.claimLimit ? ` de ${p.claimLimit}` : " (sin límite)"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <ButtonLink href={`/promo/${p.claimToken}/cartel`} variant="secondary" target="_blank" className="px-3 py-1.5 text-xs">
                            Imprimir cartel
                          </ButtonLink>
                          <form action={updateClaimAction} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={p.id} />
                            <input
                              name="claimLimit"
                              type="number"
                              min={0}
                              defaultValue={p.claimLimit ?? ""}
                              placeholder="Límite"
                              className="w-20 rounded-lg border border-stone-300 px-2 py-1.5"
                            />
                            <button name="op" value="limit" className="rounded-lg border border-stone-300 px-2 py-1.5 font-semibold">
                              Guardar límite
                            </button>
                          </form>
                          <form action={updateClaimAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <button name="op" value="rotate" className="rounded-lg px-2 py-1.5 font-semibold text-stone-500 hover:underline">
                              Generar QR nuevo
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {count(p.id) > 0 && (
                  <details className="mt-3 rounded-xl bg-red-50/60 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-red-700">Revocar cupones entregados</summary>
                    <ActionForm
                      action={revokePromotionCouponsAction}
                      className="mt-3"
                      confirm={`¿Revocar los ${count(p.id, "ACTIVE")} cupones activos de esta promoción? Dejarán de ser válidos.`}
                    >
                      <input type="hidden" name="id" value={p.id} />
                      {count(p.id, "ACTIVE") > 0 ? (
                        <>
                          <p className="text-xs text-stone-600">
                            Anula los {count(p.id, "ACTIVE")} cupones activos (no afecta los ya canjeados). Útil tras un envío de prueba. Para
                            revocar el cupón de un solo cliente, hazlo desde su ficha en Clientes.
                          </p>
                          <SubmitButton variant="danger">Revocar {count(p.id, "ACTIVE")} cupones activos</SubmitButton>
                        </>
                      ) : (
                        <p className="text-xs text-stone-600">No hay cupones activos de esta promoción.</p>
                      )}
                    </ActionForm>
                  </details>
                )}
                {live && (
                  <details className="mt-3 rounded-xl bg-stone-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-brand-700">Enviar a todos mis clientes</summary>
                    <ActionForm action={sendPromotionAction} className="mt-3" confirm="¿Entregar este cupón a todos tus clientes y notificarles?">
                      <input type="hidden" name="id" value={p.id} />
                      <Field label="Mensaje de la notificación" hint="Máx. 3 notificaciones por día en Google Wallet.">
                        <Input name="message" maxLength={150} placeholder={`Tienes un nuevo cupón: ${p.title}`} />
                      </Field>
                      <SubmitButton>Enviar cupón</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </Card>
            );
          })}
        </div>

        <Card title="Nueva promoción">
          <ActionForm action={createPromotionAction} resetOnSuccess>
            <Field label="Título">
              <Input name="title" placeholder="2x1 en capuchinos" maxLength={60} required />
            </Field>
            <Field label="Etiqueta destacada" hint="Texto corto: -20%, 2x1, GRATIS">
              <Input name="discountLabel" maxLength={20} />
            </Field>
            <Field label="Descripción">
              <Textarea name="description" maxLength={500} />
            </Field>
            <Field label="Términos y condiciones">
              <Textarea name="terms" maxLength={1000} placeholder="Válido de lunes a jueves. No acumulable." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicia">
                <Input name="startsAt" type="date" />
              </Field>
              <Field label="Termina">
                <Input name="endsAt" type="date" />
              </Field>
            </div>
            <Field label="Vigencia del cupón (días desde que se entrega)" hint="Opcional">
              <Input name="validDays" type="number" min={1} />
            </Field>
            <Field label="Entrega automática">
              <Select name="autoAssign" defaultValue="NONE">
                {Object.entries(AUTO_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Imagen (opcional)">
              <Input name="image" type="file" accept="image/png,image/jpeg,image/webp" />
            </Field>
            <Checkbox name="claimEnabled" label="Permitir que los clientes la reclamen escaneando un QR" />
            <Field label="Límite de cupones por QR (opcional)" hint="Ej. solo los primeros 50">
              <Input name="claimLimit" type="number" min={1} />
            </Field>
            <SubmitButton>Crear promoción</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
