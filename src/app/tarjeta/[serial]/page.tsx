import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { CardView } from "@/components/card-view";
import { QR } from "@/components/qr";
import { WalletButtons } from "@/components/wallet-buttons";
import { PoweredBy } from "@/components/powered-by";
import { RememberCard } from "./remember";
import { getPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi tarjeta", robots: { index: false } };

export default async function CardPage({ params, searchParams }: { params: Promise<{ serial: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const { serial } = await params;
  const { nueva } = await searchParams;
  const card = await db.loyaltyCard.findUnique({
    where: { serial },
    include: {
      business: { include: { rewards: { where: { active: true }, orderBy: { pointsCost: "asc" } }, locations: { where: { active: true } } } },
      customer: { include: { coupons: { where: { status: "ACTIVE" }, include: { promotion: true }, orderBy: { createdAt: "desc" } } } },
      transactions: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!card) notFound();
  const b = card.business;
  const coupons = card.customer.coupons.filter((c) => !c.expiresAt || c.expiresAt > new Date());

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="mx-auto max-w-md space-y-5 px-4 py-8">
        <RememberCard serial={card.serial} />
        {nueva && (
          <div className="rounded-xl bg-emerald-100 px-4 py-3 text-center text-sm font-semibold text-emerald-900">
            ¡Listo, {card.customer.name.split(" ")[0]}! Guarda tu tarjeta en tu celular 👇
          </div>
        )}
        <CardView business={b} card={card} customerName={card.customer.name} qr={<QR value={card.serial} size={170} />} />
        <p className="text-center font-mono text-xs text-stone-500">{card.serial}</p>

        <WalletButtons appleHref={`/api/wallet/apple/card/${card.serial}`} googleHref={`/api/wallet/google/card/${card.serial}`} />
        <p className="text-center text-xs text-stone-500">
          Muestra el código QR en caja para sumar {b.programType === "POINTS" ? "puntos" : b.programType === "CASHBACK" ? "saldo" : "sellos"} y canjear tus premios.
          Guarda esta página en favoritos por si no usas Wallet.
        </p>

        {card.lastMessage && (
          <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
            <div className="mb-1 text-xs font-semibold text-stone-500 uppercase">Novedades</div>
            {card.lastMessage}
          </div>
        )}

        {coupons.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-bold">Tus cupones</h2>
            {coupons.map((c) => (
              <Link key={c.id} href={`/cupon/${c.code}`} className="flex items-center justify-between rounded-2xl border-2 border-dashed border-brand-300 bg-white p-4">
                <div>
                  <div className="font-semibold">{c.promotion.title}</div>
                  {c.expiresAt && <div className="text-xs text-stone-500">Vence {formatDate(c.expiresAt)}</div>}
                </div>
                <span className="text-lg font-black text-brand-700">{c.promotion.discountLabel || "Ver"}</span>
              </Link>
            ))}
          </section>
        )}

        {b.programType === "POINTS" && b.rewards.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h2 className="mb-2 font-bold">Recompensas</h2>
            <ul className="space-y-1 text-sm">
              {b.rewards.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.name}</span>
                  <span className={card.points >= r.pointsCost ? "font-semibold text-emerald-700" : "text-stone-500"}>{r.pointsCost} pts</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {card.transactions.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h2 className="mb-2 font-bold">Movimientos recientes</h2>
            <ul className="divide-y divide-stone-100 text-sm">
              {card.transactions.map((t) => (
                <li key={t.id} className="flex justify-between py-2">
                  <span>
                    {t.description}
                    <span className="block text-xs text-stone-500">{formatDateTime(t.createdAt)}</span>
                  </span>
                  <span className="text-right text-xs font-semibold">
                    {t.pointsDelta ? `${t.pointsDelta > 0 ? "+" : ""}${t.pointsDelta} pts` : ""}
                    {t.cashbackDelta ? `${t.cashbackDelta > 0 ? "+" : "-"}${formatMoney(Math.abs(t.cashbackDelta), b.currency)}` : ""}
                    {t.stampsDelta > 0 ? `+${t.stampsDelta} sello` : ""}
                    {t.rewardsDelta > 0 ? " 🎉" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {b.locations.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-bold">Sucursales</h2>
            <ul className="space-y-1">
              {b.locations.map((l) => (
                <li key={l.id}>
                  <a className="underline" target="_blank" href={`https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}`}>
                    {l.name}
                  </a>{" "}
                  <span className="text-stone-500">{l.address}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-center text-xs text-stone-400">
          {b.name} · {b.programName}
        </p>
        <PoweredBy hidden={getPlan(b.plan).whiteLabel} />
      </div>
    </div>
  );
}
