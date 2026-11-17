"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasActiveAccess } from "@/lib/billing";
import { parseScannedCode } from "@/lib/codes";
import { formatDate, formatMoney } from "@/lib/format";
import { balanceSummary } from "@/lib/loyalty";
import { LoyaltyError, recordPurchase, redeemCashback, redeemCoupon, redeemReward } from "@/lib/services";
import { activeCouponsFor, syncCard, syncCoupon } from "@/lib/wallet/sync";

export type ScanCard = {
  kind: "card";
  cardId: string;
  serial: string;
  customerName: string;
  phone: string | null;
  balanceLabel: string;
  balanceValue: string;
  secondary?: string;
  points: number;
  cashbackCents: number;
  stamps: number;
  rewardsAvailable: number;
  visits: number;
  lastVisit: string;
  coupons: { code: string; title: string; label: string; expires: string | null }[];
};
export type ScanCoupon = {
  kind: "coupon";
  code: string;
  title: string;
  label: string;
  description: string;
  customerName: string;
  status: string;
  expires: string | null;
  valid: boolean;
  reason?: string;
};
export type ScanResult = { ok: true; data: ScanCard | ScanCoupon; message?: string } | { ok: false; error: string };

async function staff() {
  const user = await getCurrentUser();
  if (!user?.business) throw new LoyaltyError("Sesión expirada. Vuelve a iniciar sesión.");
  return user as typeof user & { business: NonNullable<typeof user.business> };
}

async function cardData(cardId: string): Promise<ScanCard> {
  const card = await db.loyaltyCard.findUniqueOrThrow({ where: { id: cardId }, include: { customer: true, business: true } });
  const b = card.business;
  const s = balanceSummary(b, card, (c) => formatMoney(c, b.currency));
  const coupons = await activeCouponsFor(card.customerId);
  return {
    kind: "card",
    cardId: card.id,
    serial: card.serial,
    customerName: card.customer.name,
    phone: card.customer.phone,
    balanceLabel: s.label,
    balanceValue: s.value,
    secondary: s.secondary,
    points: card.points,
    cashbackCents: card.cashbackCents,
    stamps: card.stamps,
    rewardsAvailable: card.rewardsAvailable,
    visits: card.visits,
    lastVisit: formatDate(card.lastVisitAt),
    coupons: coupons.map((c) => ({
      code: c.code,
      title: c.promotion.title,
      label: c.promotion.discountLabel,
      expires: c.expiresAt ? formatDate(c.expiresAt) : null,
    })),
  };
}

function fail(e: unknown): ScanResult {
  if (e instanceof LoyaltyError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Ocurrió un error. Intenta de nuevo." };
}

export async function lookupAction(raw: string): Promise<ScanResult> {
  try {
    const user = await staff();
    const parsed = parseScannedCode(raw);
    if (!parsed) throw new LoyaltyError("Código no reconocido");
    if (parsed.kind === "card") {
      const card = await db.loyaltyCard.findUnique({ where: { serial: parsed.value } });
      if (!card || card.businessId !== user.business.id) throw new LoyaltyError("Esta tarjeta no pertenece a tu negocio");
      return { ok: true, data: await cardData(card.id) };
    }
    const coupon = await db.customerCoupon.findUnique({
      where: { code: parsed.value },
      include: { promotion: true, customer: true },
    });
    if (!coupon || coupon.promotion.businessId !== user.business.id) throw new LoyaltyError("Este cupón no pertenece a tu negocio");
    const expired = coupon.expiresAt && coupon.expiresAt < new Date();
    const valid = coupon.status === "ACTIVE" && !expired;
    return {
      ok: true,
      data: {
        kind: "coupon",
        code: coupon.code,
        title: coupon.promotion.title,
        label: coupon.promotion.discountLabel,
        description: coupon.promotion.description,
        customerName: coupon.customer.name,
        status: coupon.status,
        expires: coupon.expiresAt ? formatDate(coupon.expiresAt) : null,
        valid,
        reason: coupon.status === "REDEEMED" ? `Canjeado el ${formatDate(coupon.redeemedAt)}` : expired ? "Cupón vencido" : undefined,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Búsqueda por teléfono o nombre cuando el cliente no trae su tarjeta. */
export async function searchCustomersAction(q: string) {
  const user = await staff();
  const term = q.trim();
  if (term.length < 3) return [];
  const digits = term.replace(/\D/g, "");
  const customers = await db.customer.findMany({
    where: {
      businessId: user.business.id,
      OR: [{ name: { contains: term, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])],
    },
    include: { card: true },
    take: 8,
  });
  return customers.filter((c) => c.card).map((c) => ({ name: c.name, phone: c.phone, serial: c.card!.serial }));
}

async function guard() {
  const user = await staff();
  if (!hasActiveAccess(user.business)) throw new LoyaltyError("La suscripción del negocio no está activa");
  return user;
}

export async function purchaseAction(cardId: string, purchaseCents: number, locationId?: string | null): Promise<ScanResult> {
  try {
    const user = await guard();
    const r = await recordPurchase({ staffId: user.id, businessId: user.business.id, locationId: locationId || null }, cardId, purchaseCents);
    after(() => syncCard(cardId, { notifyBalance: true }));
    const b = user.business;
    const msg =
      b.programType === "POINTS"
        ? `+${r.delta.pointsDelta} puntos`
        : b.programType === "CASHBACK"
          ? `+${formatMoney(r.delta.cashbackDelta, b.currency)} al monedero`
          : r.earnedReward
            ? `¡Tarjeta completa! Ganó: ${b.stampReward}`
            : r.delta.stampsDelta > 0
              ? "+1 sello"
              : "Visita registrada (no alcanzó la compra mínima para sello)";
    return { ok: true, data: await cardData(cardId), message: msg };
  } catch (e) {
    return fail(e);
  }
}

export async function redeemRewardAction(cardId: string, rewardId?: string, locationId?: string | null): Promise<ScanResult> {
  try {
    const user = await guard();
    const t = await redeemReward({ staffId: user.id, businessId: user.business.id, locationId: locationId || null }, cardId, rewardId);
    after(() => syncCard(cardId, { notifyBalance: true }));
    return { ok: true, data: await cardData(cardId), message: t.description };
  } catch (e) {
    return fail(e);
  }
}

export async function redeemCashbackAction(cardId: string, amountCents: number, locationId?: string | null): Promise<ScanResult> {
  try {
    const user = await guard();
    await redeemCashback({ staffId: user.id, businessId: user.business.id, locationId: locationId || null }, cardId, amountCents);
    after(() => syncCard(cardId, { notifyBalance: true }));
    return { ok: true, data: await cardData(cardId), message: `Se usaron ${formatMoney(amountCents, user.business.currency)} del monedero` };
  } catch (e) {
    return fail(e);
  }
}

export async function redeemCouponAction(code: string, locationId?: string | null, returnCardId?: string): Promise<ScanResult> {
  try {
    const user = await guard();
    const r = await redeemCoupon({ staffId: user.id, businessId: user.business.id, locationId: locationId || null }, code);
    after(async () => {
      await syncCoupon(r.coupon.id);
      if (r.cardId) await syncCard(r.cardId);
    });
    const message = `Cupón canjeado: ${r.coupon.promotion.title}`;
    if (returnCardId && returnCardId === r.cardId) return { ok: true, data: await cardData(returnCardId), message };
    const res = await lookupAction(code);
    return res.ok ? { ...res, message } : res;
  } catch (e) {
    return fail(e);
  }
}
