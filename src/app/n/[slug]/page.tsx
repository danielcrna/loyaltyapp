import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { rulesSummary, stampRules } from "@/lib/loyalty";
import { hasActiveAccess } from "@/lib/billing";
import { formatMoney } from "@/lib/format";
import { CardView } from "@/components/card-view";
import { JoinForm } from "@/components/join-form";
import { joinAction } from "./actions";
import { brandFor } from "@/lib/plans";
import { PoweredBy } from "@/components/powered-by";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const b = await db.business.findUnique({ where: { slug } });
  return { title: b ? `Únete a ${b.programName} de ${b.name}` : "Programa no encontrado" };
}

export default async function JoinPage({ params }: Props) {
  const { slug } = await params;
  const b = await db.business.findUnique({ where: { slug } });
  if (!b) notFound();
  const active = hasActiveAccess(b);
  const pitch =
    b.programType === "STAMPS"
      ? stampRules(b).length > 1
        ? `${rulesSummary(stampRules(b))}. Canjea o sigue acumulando.`
        : `Junta ${b.stampsRequired} sellos y llévate ${b.stampReward.toLowerCase()}.`
      : b.programType === "POINTS"
        ? `Gana puntos en cada compra y cámbialos por productos.`
        : `Recibe ${b.cashbackPercent}% de tus compras en tu monedero electrónico.`;
  const bonus =
    b.welcomeBonus > 0
      ? b.programType === "CASHBACK"
        ? `¡Te regalamos ${formatMoney(b.welcomeBonus, b.currency)} de bienvenida!`
        : `¡Te regalamos ${b.welcomeBonus} ${b.programType === "POINTS" ? "puntos" : "sellos"} de bienvenida!`
      : null;

  const brand = brandFor(b);
  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, ${b.bgColor} 0%, ${b.bgColor} 260px, #fafaf9 260px)` }}>
      <div className="mx-auto max-w-md px-4 pt-8 pb-12">
        <div className="mb-6 text-center" style={{ color: b.fgColor }}>
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={b.name} className="mx-auto mb-3 h-16 max-w-[240px] object-contain" />
          )}
          <h1 className={brand.logoUrl ? "sr-only" : "text-2xl font-bold"}>{b.name}</h1>
          <p className="mt-1 opacity-90">{pitch}</p>
          {bonus && <p className="mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold" style={{ background: b.labelColor, color: b.bgColor }}>{bonus}</p>}
        </div>
        <CardView business={b} customerName="Tu nombre" card={{ points: 0, cashbackCents: 0, stamps: Math.min(b.welcomeBonus, b.stampsRequired - 1), rewardsAvailable: 0, visits: 0 }} />
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          {active ? (
            <>
              <h2 className="mb-1 text-lg font-bold">Obtén tu tarjeta digital</h2>
              <p className="mb-4 text-sm text-stone-600">Guárdala en Apple Wallet o Google Wallet. Sin descargar apps.</p>
              <JoinForm
                action={joinAction.bind(null, slug)}
                askPhone={b.askPhone}
                askEmail={b.askEmail}
                askBirthday={b.askBirthday}
                businessName={b.name}
              />
            </>
          ) : (
            <p className="text-center text-sm text-stone-600">Este programa de lealtad no está disponible por el momento.</p>
          )}
        </div>
        {b.programTerms && <p className="mt-4 text-center text-xs text-stone-500">{b.programTerms}</p>}
        <PoweredBy hidden={brand.whiteLabel} />
      </div>
    </div>
  );
}
