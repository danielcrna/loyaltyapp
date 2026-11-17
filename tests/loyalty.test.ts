import { describe, expect, it } from "vitest";
import {
  applyDelta,
  computeEarn,
  computeRedeemCashback,
  computeRedeemReward,
  computeWelcome,
  LoyaltyError,
  type ProgramConfig,
} from "@/lib/loyalty";
import { parseScannedCode, newCardSerial, newCouponCode } from "@/lib/codes";
import { parseMoneyToCents, slugify } from "@/lib/format";

const base: ProgramConfig = {
  programType: "STAMPS",
  pointsPerCurrency: 1,
  cashbackPercent: 5,
  stampsRequired: 10,
  stampMinPurchase: 0,
  minRedeemCashback: 0,
};
const empty = { points: 0, cashbackCents: 0, stamps: 0, rewardsAvailable: 0 };

describe("sellos", () => {
  it("suma un sello por visita", () => {
    const d = computeEarn(base, empty, 0);
    expect(applyDelta(empty, d)).toEqual({ ...empty, stamps: 1 });
  });

  it("al completar la tarjeta convierte los sellos en recompensa y reinicia", () => {
    const card = { ...empty, stamps: 9 };
    const after = applyDelta(card, computeEarn(base, card, 5000));
    expect(after.stamps).toBe(0);
    expect(after.rewardsAvailable).toBe(1);
  });

  it("respeta la compra mínima", () => {
    const cfg = { ...base, stampMinPurchase: 10000 };
    expect(computeEarn(cfg, empty, 5000).stampsDelta).toBe(0);
    expect(computeEarn(cfg, empty, 10000).stampsDelta).toBe(1);
  });

  it("bono de bienvenida mayor a la tarjeta genera recompensas", () => {
    const after = applyDelta(empty, computeWelcome({ ...base, stampsRequired: 3 }, empty, 7));
    expect(after).toEqual({ ...empty, stamps: 1, rewardsAvailable: 2 });
  });

  it("no permite canjear sin recompensa disponible", () => {
    expect(() => computeRedeemReward(base, empty)).toThrow(LoyaltyError);
    expect(computeRedeemReward(base, { ...empty, rewardsAvailable: 1 }).rewardsDelta).toBe(-1);
  });
});

describe("puntos", () => {
  const cfg: ProgramConfig = { ...base, programType: "POINTS", pointsPerCurrency: 0.1 };
  it("1 punto por cada $10", () => {
    expect(computeEarn(cfg, empty, 25550).pointsDelta).toBe(25);
  });
  it("canje descuenta puntos y valida saldo", () => {
    expect(computeRedeemReward(cfg, { ...empty, points: 100 }, 80).pointsDelta).toBe(-80);
    expect(() => computeRedeemReward(cfg, { ...empty, points: 50 }, 80)).toThrow("Puntos insuficientes");
  });
});

describe("monedero", () => {
  const cfg: ProgramConfig = { ...base, programType: "CASHBACK", cashbackPercent: 5, minRedeemCashback: 5000 };
  it("regresa el % de la compra", () => {
    expect(computeEarn(cfg, empty, 20000).cashbackDelta).toBe(1000);
  });
  it("valida saldo y mínimo", () => {
    expect(() => computeRedeemCashback(cfg, { ...empty, cashbackCents: 3000 }, 1000)).toThrow(LoyaltyError);
    expect(() => computeRedeemCashback(cfg, { ...empty, cashbackCents: 6000 }, 7000)).toThrow("Saldo insuficiente");
    expect(computeRedeemCashback(cfg, { ...empty, cashbackCents: 6000 }, 6000).cashbackDelta).toBe(-6000);
  });
});

describe("códigos", () => {
  it("genera y reconoce seriales y cupones", () => {
    const c = newCardSerial();
    const p = newCouponCode();
    expect(parseScannedCode(c)).toEqual({ kind: "card", value: c });
    expect(parseScannedCode(p.toLowerCase())).toEqual({ kind: "coupon", value: p });
    expect(parseScannedCode(`https://ejemplo.com/tarjeta/${c}`)).toEqual({ kind: "card", value: c });
    expect(parseScannedCode("hola")).toBeNull();
  });
});

describe("formato", () => {
  it("convierte montos a centavos", () => {
    expect(parseMoneyToCents("123.45")).toBe(12345);
    expect(parseMoneyToCents("$1,5")).toBe(150);
    expect(parseMoneyToCents("")).toBe(0);
  });
  it("lee la coma de miles como en México", () => {
    expect(parseMoneyToCents("1,500")).toBe(150000);
    expect(parseMoneyToCents("$1,500.50")).toBe(150050);
    expect(parseMoneyToCents("12,345,678")).toBe(1234567800);
    expect(parseMoneyToCents("1.500,50")).toBe(150050);
    expect(parseMoneyToCents("1.500.000")).toBe(150000000);
  });
  it("acepta coma decimal con uno o dos dígitos", () => {
    expect(parseMoneyToCents("150,50")).toBe(15050);
    expect(parseMoneyToCents("0,500")).toBe(50);
    expect(parseMoneyToCents("150.5")).toBe(15050);
  });
  it("rechaza montos que no se pueden leer", () => {
    expect(parseMoneyToCents("1,5,0")).toBe(0);
    expect(parseMoneyToCents("abc")).toBe(0);
  });
  it("genera slugs", () => {
    expect(slugify("Café La Ñora & Co.")).toBe("cafe-la-nora-co");
  });
});
