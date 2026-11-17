// Motor de reglas del programa de lealtad: funciones puras (sin base de datos) fáciles de probar.
import type { ProgramType } from "@prisma/client";

export type ProgramConfig = {
  programType: ProgramType;
  pointsPerCurrency: number;
  cashbackPercent: number;
  stampsRequired: number;
  stampMinPurchase: number; // centavos
  minRedeemCashback: number; // centavos
};

export type CardBalances = {
  points: number;
  cashbackCents: number;
  stamps: number;
  rewardsAvailable: number;
};

export type Delta = {
  pointsDelta: number;
  cashbackDelta: number;
  stampsDelta: number;
  rewardsDelta: number;
};

export const ZERO_DELTA: Delta = { pointsDelta: 0, cashbackDelta: 0, stampsDelta: 0, rewardsDelta: 0 };

/** Aplica sellos y convierte cada bloque completo en una recompensa disponible. */
function addStamps(card: CardBalances, cfg: ProgramConfig, stamps: number): Delta {
  const required = Math.max(1, cfg.stampsRequired);
  const total = card.stamps + stamps;
  const rewards = Math.floor(total / required);
  const remaining = total % required;
  return { ...ZERO_DELTA, stampsDelta: remaining - card.stamps, rewardsDelta: rewards };
}

/**
 * Calcula lo que gana un cliente por una compra (o visita, si purchaseCents = 0 en programa de sellos).
 */
export function computeEarn(cfg: ProgramConfig, card: CardBalances, purchaseCents: number): Delta {
  const purchase = Math.max(0, Math.round(purchaseCents));
  switch (cfg.programType) {
    case "POINTS":
      return { ...ZERO_DELTA, pointsDelta: Math.floor((purchase / 100) * cfg.pointsPerCurrency) };
    case "CASHBACK":
      return { ...ZERO_DELTA, cashbackDelta: Math.floor((purchase * cfg.cashbackPercent) / 100) };
    case "STAMPS": {
      if (cfg.stampMinPurchase > 0 && purchase < cfg.stampMinPurchase) return { ...ZERO_DELTA };
      return addStamps(card, cfg, 1);
    }
  }
}

/** Bono de bienvenida al inscribirse. */
export function computeWelcome(cfg: ProgramConfig, card: CardBalances, bonus: number): Delta {
  if (bonus <= 0) return { ...ZERO_DELTA };
  switch (cfg.programType) {
    case "POINTS":
      return { ...ZERO_DELTA, pointsDelta: bonus };
    case "CASHBACK":
      return { ...ZERO_DELTA, cashbackDelta: bonus };
    case "STAMPS":
      return addStamps(card, cfg, bonus);
  }
}

export class LoyaltyError extends Error {}

/** Canje de una recompensa del catálogo (puntos) o de una recompensa de sellos. */
export function computeRedeemReward(cfg: ProgramConfig, card: CardBalances, pointsCost?: number): Delta {
  if (cfg.programType === "POINTS") {
    if (!pointsCost || pointsCost <= 0) throw new LoyaltyError("Recompensa inválida");
    if (card.points < pointsCost) throw new LoyaltyError("Puntos insuficientes");
    return { ...ZERO_DELTA, pointsDelta: -pointsCost };
  }
  if (cfg.programType === "STAMPS") {
    if (card.rewardsAvailable < 1) throw new LoyaltyError("El cliente aún no completa su tarjeta");
    return { ...ZERO_DELTA, rewardsDelta: -1 };
  }
  throw new LoyaltyError("El programa de monedero no usa recompensas; usa el saldo");
}

/** Uso del saldo del monedero electrónico. */
export function computeRedeemCashback(cfg: ProgramConfig, card: CardBalances, amountCents: number): Delta {
  if (cfg.programType !== "CASHBACK") throw new LoyaltyError("Este programa no tiene monedero");
  const amount = Math.round(amountCents);
  if (amount <= 0) throw new LoyaltyError("Monto inválido");
  if (amount > card.cashbackCents) throw new LoyaltyError("Saldo insuficiente");
  if (cfg.minRedeemCashback > 0 && card.cashbackCents < cfg.minRedeemCashback)
    throw new LoyaltyError("Aún no alcanza el saldo mínimo para usar el monedero");
  return { ...ZERO_DELTA, cashbackDelta: -amount };
}

export function applyDelta(card: CardBalances, d: Delta): CardBalances {
  return {
    points: card.points + d.pointsDelta,
    cashbackCents: card.cashbackCents + d.cashbackDelta,
    stamps: card.stamps + d.stampsDelta,
    rewardsAvailable: card.rewardsAvailable + d.rewardsDelta,
  };
}

/** Texto corto del saldo, usado en pases y en la tarjeta web. */
export function balanceSummary(
  cfg: ProgramConfig & { stampReward?: string },
  card: CardBalances,
  formatMoney: (c: number) => string,
): { label: string; value: string; secondary?: string } {
  switch (cfg.programType) {
    case "POINTS":
      return { label: "Puntos", value: card.points.toLocaleString("es-MX") };
    case "CASHBACK":
      return { label: "Saldo", value: formatMoney(card.cashbackCents) };
    case "STAMPS":
      return {
        label: "Sellos",
        value: `${card.stamps}/${cfg.stampsRequired}`,
        secondary:
          card.rewardsAvailable > 0
            ? `${card.rewardsAvailable} recompensa${card.rewardsAvailable > 1 ? "s" : ""} lista${card.rewardsAvailable > 1 ? "s" : ""}`
            : undefined,
      };
  }
}

export const PROGRAM_LABELS: Record<ProgramType, string> = {
  POINTS: "Puntos",
  CASHBACK: "Monedero electrónico (cashback)",
  STAMPS: "Sellos / visitas",
};

// ─────────────────────────── Niveles del programa de sellos ───────────────────────────
//
// Ej. tarjeta de 10 sellos con un nivel intermedio:
//   5 sellos  → "Americano chico"   (canje opcional: descuenta 5 sellos)
//   10 sellos → "Bebida de tu elección" (al completar la tarjeta se gana y se reinicia)
// El cliente decide en caja si canjea el nivel intermedio o sigue acumulando.

export type StampRule = { stamps: number; reward: string; final?: boolean };

/** Lee y limpia los niveles intermedios guardados (JSON): válidos, únicos, ordenados y menores al total. */
export function parseStampTiers(raw: unknown, stampsRequired: number): StampRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  return raw
    .map((t) => ({
      stamps: Math.floor(Number((t as StampRule)?.stamps)),
      reward: String((t as StampRule)?.reward ?? "").trim().slice(0, 60),
    }))
    .filter((t) => t.stamps >= 1 && t.stamps < stampsRequired && t.reward && !seen.has(t.stamps) && seen.add(t.stamps))
    .sort((a, b) => a.stamps - b.stamps);
}

/** Todas las reglas del programa: niveles intermedios + recompensa final. */
export function stampRules(b: { stampTiers: unknown; stampsRequired: number; stampReward: string }): StampRule[] {
  return [...parseStampTiers(b.stampTiers, b.stampsRequired), { stamps: b.stampsRequired, reward: b.stampReward, final: true }];
}

/** Canje de un nivel intermedio: descuenta sus sellos. */
export function computeRedeemTier(card: CardBalances, tier: StampRule): Delta {
  if (tier.final) throw new LoyaltyError("La recompensa final se canjea al completar la tarjeta");
  if (card.stamps < tier.stamps) throw new LoyaltyError(`Se necesitan ${tier.stamps} sellos para "${tier.reward}"`);
  return { ...ZERO_DELTA, stampsDelta: -tier.stamps };
}

/** Niveles intermedios que se alcanzaron al pasar de `before` a `after` sellos (sin completar la tarjeta). */
export function tiersReached(tiers: StampRule[], before: number, after: number): StampRule[] {
  return tiers.filter((t) => !t.final && before < t.stamps && t.stamps <= after);
}

/** Estado del cliente: qué puede canjear ya y cuál es su siguiente meta. */
export function stampStatus(rules: StampRule[], card: Pick<CardBalances, "stamps" | "rewardsAvailable">) {
  const available = rules.filter((r) => !r.final && card.stamps >= r.stamps);
  const next = rules.find((r) => r.stamps > card.stamps) ?? rules[rules.length - 1];
  return { available, next, remaining: Math.max(0, next.stamps - card.stamps) };
}

/** Texto corto de las reglas: "5 sellos: Americano chico · 10 sellos: Bebida gratis". */
export function rulesSummary(rules: StampRule[]) {
  return rules.map((r) => `${r.stamps} sellos: ${r.reward}`).join(" · ");
}

/** Línea corta de recompensa para pases y tarjeta web: lo que ya puede canjear o su siguiente meta. */
export function stampRewardLine(rules: StampRule[], card: Pick<CardBalances, "stamps" | "rewardsAvailable">) {
  const final = rules[rules.length - 1];
  if (card.rewardsAvailable > 0) return `${card.rewardsAvailable > 1 ? `${card.rewardsAvailable}× ` : ""}${final.reward} ✓`;
  const st = stampStatus(rules, card);
  const ready = st.available[st.available.length - 1];
  if (ready) return `${ready.reward} ✓`;
  if (rules.length === 1) return final.reward;
  return `${st.next.reward} (faltan ${st.remaining})`;
}
