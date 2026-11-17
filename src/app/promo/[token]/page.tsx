import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { hasActiveAccess } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { brandFor } from "@/lib/plans";
import { rememberedCard } from "@/lib/remember";
import { isPromotionLive } from "@/lib/services";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { JoinForm } from "@/components/join-form";
import { PoweredBy } from "@/components/powered-by";
import { claimRememberedAction, claimWithContactAction, joinAndClaimAction } from "./actions";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const p = await db.promotion.findUnique({ where: { claimToken: token }, include: { business: true } });
  return { title: p ? `${p.title} · ${p.business.name}` : "Promoción", robots: { index: false } };
}

export default async function PromoClaimPage({ params }: Props) {
  const { token } = await params;
  const promo = await db.promotion.findUnique({ where: { claimToken: token }, include: { business: true } });
  if (!promo) notFound();
  const b = promo.business;
  const brand = brandFor(b);
  const available = promo.claimEnabled && isPromotionLive(promo) && hasActiveAccess(b);
  const card = available ? await rememberedCard(b.id) : null;
  const already = card
    ? await db.customerCoupon.findFirst({ where: { promotionId: promo.id, customerId: card.customerId, status: { not: "VOID" } } })
    : null;

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, ${b.bgColor} 0%, ${b.bgColor} 300px, #fafaf9 300px)` }}>
      <div className="mx-auto max-w-md px-4 pt-8 pb-12">
        <div className="mb-5 text-center" style={{ color: b.fgColor }}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={b.name} className="mx-auto h-12 max-w-[200px] object-contain" />
          ) : (
            <div className="text-lg font-bold">{b.name}</div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border-2 border-dashed bg-white shadow-xl" style={{ borderColor: b.labelColor }}>
          {promo.imageId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${promo.imageId}`} alt="" className="h-44 w-full object-cover" />
          )}
          <div className="p-6 text-center">
            {promo.discountLabel && <div className="text-4xl font-black text-brand-700">{promo.discountLabel}</div>}
            <h1 className="mt-1 text-xl font-bold">{promo.title}</h1>
            {promo.description && <p className="mt-2 text-sm text-stone-600">{promo.description}</p>}
            {promo.endsAt && <p className="mt-2 text-xs text-stone-500">Válido hasta {formatDate(promo.endsAt)}</p>}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {!available ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-600">
              Esta promoción ya no está disponible.
            </div>
          ) : card ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
              <p className="mb-4 text-sm text-stone-600">
                Hola, <strong>{card.customer.name.split(" ")[0]}</strong>.{" "}
                {already ? "Este cupón ya está en tu tarjeta." : "Agrégalo a tu tarjeta de lealtad con un toque."}
              </p>
              {already ? (
                <a href={`/cupon/${already.code}`} className="block rounded-xl bg-brand-600 py-3 font-bold text-white">
                  Ver mi cupón
                </a>
              ) : (
                <ActionForm action={claimRememberedAction.bind(null, token)}>
                  <SubmitButton className="w-full py-3 text-base">Agregar a mi tarjeta</SubmitButton>
                </ActionForm>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <h2 className="mb-1 text-lg font-bold">¿Ya tienes tarjeta de {b.name}?</h2>
                <p className="mb-4 text-sm text-stone-600">Escribe el teléfono o correo con el que te inscribiste.</p>
                <ActionForm action={claimWithContactAction.bind(null, token)}>
                  <Field label="Teléfono o correo">
                    <Input name="contact" autoComplete="tel" required />
                  </Field>
                  <SubmitButton className="w-full">Agregar cupón a mi tarjeta</SubmitButton>
                </ActionForm>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <h2 className="mb-1 text-lg font-bold">¿Eres nuevo?</h2>
                <p className="mb-4 text-sm text-stone-600">Obtén tu tarjeta digital de {b.programName} y recibe este cupón al instante.</p>
                <JoinForm
                  action={joinAndClaimAction.bind(null, token)}
                  askPhone={b.askPhone}
                  askEmail={b.askEmail}
                  askBirthday={b.askBirthday}
                  businessName={b.name}
                  submitLabel="Obtener mi tarjeta y el cupón"
                />
              </div>
            </>
          )}
        </div>
        {promo.terms && <p className="mt-4 text-center text-xs text-stone-500">{promo.terms}</p>}
        <PoweredBy hidden={brand.whiteLabel} />
      </div>
    </div>
  );
}
