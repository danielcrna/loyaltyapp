import type { Business, LoyaltyCard } from "@prisma/client";
import { balanceSummary } from "@/lib/loyalty";
import { formatMoney } from "@/lib/format";

type Props = {
  business: Pick<
    Business,
    | "id"
    | "name"
    | "programName"
    | "programType"
    | "bgColor"
    | "fgColor"
    | "labelColor"
    | "logoId"
    | "stripId"
    | "stampsRequired"
    | "stampReward"
    | "pointsPerCurrency"
    | "cashbackPercent"
    | "stampMinPurchase"
    | "minRedeemCashback"
    | "currency"
  >;
  card?: Pick<LoyaltyCard, "points" | "cashbackCents" | "stamps" | "rewardsAvailable" | "visits"> | null;
  customerName?: string;
  qr?: React.ReactNode;
};

/** Vista de la tarjeta con el estilo del pase de Wallet (se usa en el panel y en la página del cliente). */
export function CardView({ business: b, card, customerName = "Nombre del cliente", qr }: Props) {
  const balances = card ?? { points: 120, cashbackCents: 4550, stamps: Math.min(3, b.stampsRequired), rewardsAvailable: 0, visits: 3 };
  const summary = balanceSummary(b, balances, (c) => formatMoney(c, b.currency));
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl shadow-xl" style={{ backgroundColor: b.bgColor, color: b.fgColor }}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          {b.logoId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${b.logoId}`} alt={b.name} className="h-8 max-w-[140px] object-contain" />
          ) : (
            <span className="truncate font-semibold">{b.name}</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: b.labelColor }}>
            {summary.label}
          </div>
          <div className="text-lg leading-tight font-semibold">{summary.value}</div>
        </div>
      </div>

      {b.programType === "STAMPS" ? (
        <div className="relative px-4 py-4" style={b.stripId ? { backgroundImage: `url(/api/media/${b.stripId})`, backgroundSize: "cover" } : {}}>
          <div className={`grid gap-2 ${b.stampsRequired > 10 ? "grid-cols-10" : "grid-cols-5"}`}>
            {Array.from({ length: b.stampsRequired }).map((_, i) => {
              const filled = i < balances.stamps;
              return (
                <div
                  key={i}
                  className="grid aspect-square place-items-center rounded-full border-2 text-sm font-bold"
                  style={{
                    borderColor: filled ? b.labelColor : `${b.fgColor}88`,
                    backgroundColor: filled ? b.labelColor : "transparent",
                    color: b.bgColor,
                  }}
                >
                  {filled ? "✓" : ""}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="px-4 py-6"
          style={b.stripId ? { backgroundImage: `url(/api/media/${b.stripId})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
        >
          <div className="text-xs font-semibold uppercase" style={{ color: b.labelColor }}>
            {summary.label}
          </div>
          <div className="text-4xl font-bold">{summary.value}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 px-4 py-3 text-sm">
        <div>
          <div className="text-[10px] font-semibold uppercase" style={{ color: b.labelColor }}>
            Cliente
          </div>
          <div className="truncate">{customerName}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase" style={{ color: b.labelColor }}>
            {b.programType === "STAMPS" ? "Recompensa" : "Visitas"}
          </div>
          <div className="truncate">
            {b.programType === "STAMPS" ? (balances.rewardsAvailable > 0 ? `${balances.rewardsAvailable} lista(s) 🎉` : b.stampReward) : balances.visits}
          </div>
        </div>
      </div>
      {qr && <div className="flex justify-center px-4 pt-2 pb-5"><div className="rounded-xl bg-white p-3">{qr}</div></div>}
      <div className="px-4 pb-3 text-center text-[10px] opacity-60">{b.programName}</div>
    </div>
  );
}
