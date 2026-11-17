import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { QR } from "@/components/qr";
import { WalletButtons } from "@/components/wallet-buttons";
import { PoweredBy } from "@/components/powered-by";
import { getPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi cupón", robots: { index: false } };

export default async function CouponPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { code } = await params;
  const { nuevo } = await searchParams;
  const coupon = await db.customerCoupon.findUnique({
    where: { code },
    include: { promotion: { include: { business: true } }, customer: { include: { card: true } } },
  });
  if (!coupon) notFound();
  const p = coupon.promotion;
  const b = p.business;
  const expired = coupon.expiresAt && coupon.expiresAt < new Date();
  const valid = coupon.status === "ACTIVE" && !expired;
  return (
    <div className="min-h-screen bg-stone-100">
      <div className="mx-auto max-w-md space-y-5 px-4 py-8">
        {nuevo && valid && (
          <div className="rounded-xl bg-emerald-100 px-4 py-3 text-center text-sm font-semibold text-emerald-900">
            ¡Listo! El cupón ya está en tu tarjeta. Muéstralo en caja para canjearlo.
          </div>
        )}
        <div className="overflow-hidden rounded-2xl shadow-xl" style={{ background: b.bgColor, color: b.fgColor }}>
          {p.imageId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${p.imageId}`} alt="" className="h-40 w-full object-cover" />
          )}
          <div className="p-6 text-center">
            <div className="text-sm opacity-80">{b.name}</div>
            {p.discountLabel && <div className="mt-2 text-4xl font-black" style={{ color: b.labelColor }}>{p.discountLabel}</div>}
            <div className="mt-1 text-xl font-bold">{p.title}</div>
            {p.description && <p className="mt-2 text-sm opacity-90">{p.description}</p>}
            <div className="mx-auto mt-5 w-fit rounded-xl bg-white p-3">
              {valid ? <QR value={coupon.code} size={170} /> : <div className="grid size-[170px] place-items-center text-lg font-bold text-stone-500">{coupon.status === "REDEEMED" ? "Canjeado" : coupon.status === "VOID" ? "Revocado" : "Vencido"}</div>}
            </div>
            <div className="mt-2 font-mono text-xs opacity-70">{coupon.code}</div>
            {coupon.expiresAt && <div className="mt-2 text-sm">Válido hasta {formatDate(coupon.expiresAt)}</div>}
          </div>
        </div>
        {valid && <WalletButtons appleHref={`/api/wallet/apple/coupon/${coupon.code}`} googleHref={`/api/wallet/google/coupon/${coupon.code}`} />}
        {p.terms && <p className="text-center text-xs text-stone-500">{p.terms}</p>}
        {coupon.customer.card && (
          <Link href={`/tarjeta/${coupon.customer.card.serial}`} className="block text-center text-sm font-semibold text-brand-700">
            ← Ver mi tarjeta de lealtad
          </Link>
        )}
        <PoweredBy hidden={getPlan(b.plan).whiteLabel} />
      </div>
    </div>
  );
}
