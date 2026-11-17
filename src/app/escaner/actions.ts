"use server";

import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasActiveAccess } from "@/lib/billing";
import { parseScannedCode } from "@/lib/codes";
import { formatDate, formatMoney } from "@/lib/format";
import { balanceSummary } from "@/lib/loyalty";
import {
  LoyaltyError,
  recordPurchase,
  redeemCashback,
  redeemCoupon,
  redeemReward,
  undoKey,
  undoPurchase,
} from "@/lib/services";
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
  stampsRequired: number;
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
export type ScanResult =
  | { ok: true; data: ScanCard | ScanCoupon; message?: string; earnedReward?: boolean }
  | { ok: false; error: string };

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
    stampsRequired: b.stampsRequired,
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

/** Acepta solo claves con la forma que genera el escáner (UUID u otra cadena corta sin espacios). */
const cleanId = (id: unknown): string | null => (typeof id === "string" && /^[\w-]{8,64}$/.test(id) ? id : null);

const isDuplicateRequest = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target ?? "").includes("requestId");

/**
 * Si el escáner reintenta un movimiento que ya quedó registrado (misma clave), devuelve ese
 * registro en lugar de aplicarlo otra vez.
 */
async function replay(businessId: string, requestId?: string | null): Promise<ScanResult | null> {
  if (!requestId) return null;
  const undone = await db.transaction.findUnique({ where: { requestId: undoKey(requestId) } });
  if (undone && undone.businessId === businessId) return { ok: false, error: "Este registro se deshizo; no se volvió a registrar." };
  const prev = await db.transaction.findUnique({ where: { requestId } });
  if (!prev || prev.businessId !== businessId) return null;
  return { ok: true, data: await cardData(prev.cardId), message: `Ya estaba registrado: ${prev.description}` };
}

/** Corre un movimiento con su clave; un duplicado concurrente se resuelve con el registro existente. */
async function once(businessId: string, requestId: string | null | undefined, run: () => Promise<ScanResult>): Promise<ScanResult> {
  const prev = await replay(businessId, requestId);
  if (prev) return prev;
  try {
    return await run();
  } catch (e) {
    if (isDuplicateRequest(e)) {
      const again = await replay(businessId, requestId);
      if (again) return again;
    }
    throw e;
  }
}

export async function lookupAction(raw: string): Promise<ScanResult> {
  try {
    const user = await staff();
    const parsed = parseScannedCode(raw);
    if (!parsed) throw new LoyaltyError("Código no reconocido. Revisa que sea el QR de una tarjeta de lealtad o de un cupón.");
    if (parsed.kind === "card") {
      const card = await db.loyaltyCard.findUnique({ where: { serial: parsed.value } });
      if (!card || card.businessId !== user.business.id) throw new LoyaltyError("Esta tarjeta es de otro negocio; no se puede usar aquí.");
      return { ok: true, data: await cardData(card.id) };
    }
    const coupon = await db.customerCoupon.findUnique({
      where: { code: parsed.value },
      include: { promotion: true, customer: true },
    });
    if (!coupon || coupon.promotion.businessId !== user.business.id) throw new LoyaltyError("Este cupón es de otro negocio; no se puede usar aquí.");
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
        reason:
          coupon.status === "REDEEMED"
            ? `Canjeado el ${formatDate(coupon.redeemedAt)}`
            : coupon.status === "VOID"
              ? "Cupón revocado por el negocio"
              : expired
                ? "Cupón vencido"
                : undefined,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export type CustomerMatch = { name: string; phone: string | null; serial: string };
export type SearchResult = { ok: true; customers: CustomerMatch[] } | { ok: false; error: string };

/** Búsqueda por teléfono o nombre cuando el cliente no trae su tarjeta. */
export async function searchCustomersAction(q: string): Promise<SearchResult> {
  try {
    const user = await staff();
    const term = q.trim();
    if (term.length < 3) return { ok: true, customers: [] };
    const digits = term.replace(/\D/g, "");
    const customers = await db.customer.findMany({
      where: {
        businessId: user.business.id,
        OR: [{ name: { contains: term, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])],
      },
      include: { card: true },
      take: 8,
    });
    return {
      ok: true,
      customers: customers.filter((c) => c.card).map((c) => ({ name: c.name, phone: c.phone, serial: c.card!.serial })),
    };
  } catch (e) {
    if (e instanceof LoyaltyError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "No se pudo buscar. Intenta de nuevo." };
  }
}

async function guard() {
  const user = await staff();
  if (!hasActiveAccess(user.business)) throw new LoyaltyError("La suscripción del negocio no está activa");
  return user;
}

export async function purchaseAction(
  cardId: string,
  purchaseCents: number,
  locationId?: string | null,
  requestId?: string | null,
): Promise<ScanResult> {
  try {
    const user = await guard();
    const ctx = { staffId: user.id, businessId: user.business.id, locationId: locationId || null, requestId: cleanId(requestId) };
    return await once(user.business.id, ctx.requestId, async () => {
      const r = await recordPurchase(ctx, cardId, purchaseCents);
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
                : `Visita registrada sin sello: la compra fue menor a ${formatMoney(b.stampMinPurchase, b.currency)}`;
      return { ok: true, data: await cardData(cardId), message: msg, earnedReward: r.earnedReward };
    });
  } catch (e) {
    return fail(e);
  }
}

/** Deshace una compra o visita recién registrada desde este escáner. */
export async function undoPurchaseAction(requestId: string): Promise<ScanResult> {
  try {
    const user = await guard();
    const id = cleanId(requestId);
    if (!id) throw new LoyaltyError("No se encontró el registro para deshacer");
    const r = await undoPurchase({ staffId: user.id, businessId: user.business.id }, id);
    after(() => syncCard(r.cardId));
    return { ok: true, data: await cardData(r.cardId), message: `Se deshizo: ${r.description}` };
  } catch (e) {
    return fail(e);
  }
}

export async function redeemRewardAction(
  cardId: string,
  rewardId?: string,
  locationId?: string | null,
  requestId?: string | null,
): Promise<ScanResult> {
  try {
    const user = await guard();
    const ctx = { staffId: user.id, businessId: user.business.id, locationId: locationId || null, requestId: cleanId(requestId) };
    return await once(user.business.id, ctx.requestId, async () => {
      const t = await redeemReward(ctx, cardId, rewardId);
      after(() => syncCard(cardId, { notifyBalance: true }));
      return { ok: true, data: await cardData(cardId), message: t.description };
    });
  } catch (e) {
    return fail(e);
  }
}

export async function redeemCashbackAction(
  cardId: string,
  amountCents: number,
  locationId?: string | null,
  requestId?: string | null,
): Promise<ScanResult> {
  try {
    const user = await guard();
    const ctx = { staffId: user.id, businessId: user.business.id, locationId: locationId || null, requestId: cleanId(requestId) };
    return await once(user.business.id, ctx.requestId, async () => {
      await redeemCashback(ctx, cardId, amountCents);
      after(() => syncCard(cardId, { notifyBalance: true }));
      return { ok: true, data: await cardData(cardId), message: `Se usaron ${formatMoney(amountCents, user.business.currency)} del monedero` };
    });
  } catch (e) {
    return fail(e);
  }
}

export async function redeemCouponAction(
  code: string,
  locationId?: string | null,
  returnCardId?: string,
  requestId?: string | null,
): Promise<ScanResult> {
  try {
    const user = await guard();
    const ctx = { staffId: user.id, businessId: user.business.id, locationId: locationId || null, requestId: cleanId(requestId) };
    return await once(user.business.id, ctx.requestId, async () => {
      const r = await redeemCoupon(ctx, code);
      after(async () => {
        await syncCoupon(r.coupon.id);
        if (r.cardId) await syncCard(r.cardId);
      });
      const message = `Cupón canjeado: ${r.coupon.promotion.title}`;
      if (returnCardId && returnCardId === r.cardId) return { ok: true, data: await cardData(returnCardId), message };
      const res = await lookupAction(code);
      return res.ok ? { ...res, message } : res;
    });
  } catch (e) {
    return fail(e);
  }
}
