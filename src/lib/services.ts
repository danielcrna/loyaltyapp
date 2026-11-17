import "server-only";
import { Prisma, type Business, type Promotion, type TxType } from "@prisma/client";
import { db } from "./db";
import { newAuthToken, newCardSerial, newCouponCode } from "./codes";
import {
  LoyaltyError,
  computeEarn,
  computeRedeemCashback,
  computeRedeemReward,
  computeWelcome,
  type Delta,
} from "./loyalty";
import { getPlan } from "./plans";
import { formatMoney } from "./format";

export { LoyaltyError };

type Tx = Prisma.TransactionClient;

/** Bloquea la fila de la tarjeta durante la transacción para evitar dobles canjes simultáneos. */
async function lockCard(tx: Tx, cardId: string) {
  await tx.$queryRaw`SELECT id FROM "LoyaltyCard" WHERE id = ${cardId} FOR UPDATE`;
  return tx.loyaltyCard.findUniqueOrThrow({ where: { id: cardId } });
}

async function applyTx(
  tx: Tx,
  args: {
    businessId: string;
    cardId: string;
    type: TxType;
    delta: Delta;
    purchaseCents?: number;
    description: string;
    staffId?: string | null;
    locationId?: string | null;
    rewardId?: string;
    couponId?: string;
    countsAsVisit?: boolean;
    requestId?: string | null;
  },
) {
  const { delta } = args;
  const visit = args.countsAsVisit ?? false;
  await tx.loyaltyCard.update({
    where: { id: args.cardId },
    data: {
      points: { increment: delta.pointsDelta },
      lifetimePoints: { increment: Math.max(0, delta.pointsDelta) },
      cashbackCents: { increment: delta.cashbackDelta },
      stamps: { increment: delta.stampsDelta },
      rewardsAvailable: { increment: delta.rewardsDelta },
      totalSpentCents: { increment: args.purchaseCents ?? 0 },
      ...(visit ? { visits: { increment: 1 }, lastVisitAt: new Date() } : {}),
    },
  });
  return tx.transaction.create({
    data: {
      businessId: args.businessId,
      cardId: args.cardId,
      type: args.type,
      purchaseCents: args.purchaseCents ?? 0,
      pointsDelta: delta.pointsDelta,
      cashbackDelta: delta.cashbackDelta,
      stampsDelta: delta.stampsDelta,
      rewardsDelta: delta.rewardsDelta,
      description: args.description,
      staffId: args.staffId ?? null,
      locationId: args.locationId ?? null,
      rewardId: args.rewardId,
      couponId: args.couponId,
      requestId: args.requestId ?? null,
    },
  });
}

// ─────────────────────────── Inscripción ───────────────────────────

export type EnrollInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  birthday?: Date | null;
  marketingConsent: boolean;
  source?: string;
};

export function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Inscribe a un cliente. Si ya existe (mismo correo o teléfono en el negocio) devuelve su tarjeta existente
 * en lugar de duplicarla.
 */
export async function enrollCustomer(business: Business, input: EnrollInput) {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = normalizePhone(input.phone);

  const existing = await db.customer.findFirst({
    where: {
      businessId: business.id,
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
    include: { card: true },
  });
  if (existing?.card) return { card: existing.card, created: false };

  const plan = getPlan(business.plan);
  if (Number.isFinite(plan.maxCustomers)) {
    const count = await db.customer.count({ where: { businessId: business.id } });
    if (count >= plan.maxCustomers) {
      throw new LoyaltyError("Este programa alcanzó su límite de miembros. Avísale al negocio.");
    }
  }

  const result = await db.$transaction(async (tx) => {
    const customer =
      existing ??
      (await tx.customer.create({
        data: {
          businessId: business.id,
          name: input.name.trim(),
          email,
          phone,
          birthday: input.birthday ?? null,
          marketingConsent: input.marketingConsent,
          source: input.source ?? "qr",
        },
      }));
    const card = await tx.loyaltyCard.create({
      data: {
        serial: newCardSerial(),
        authToken: newAuthToken(),
        businessId: business.id,
        customerId: customer.id,
      },
    });
    const welcome = computeWelcome(business, card, business.welcomeBonus);
    if (business.welcomeBonus > 0) {
      await applyTx(tx, {
        businessId: business.id,
        cardId: card.id,
        type: "WELCOME",
        delta: welcome,
        description: "Bono de bienvenida",
      });
    }
    // Cupones automáticos de bienvenida
    const promos = await tx.promotion.findMany({
      where: { businessId: business.id, active: true, autoAssign: "NEW_MEMBERS" },
    });
    for (const p of promos.filter((x) => isPromotionLive(x))) await createCoupon(tx, p, customer.id, "auto");
    return tx.loyaltyCard.findUniqueOrThrow({ where: { id: card.id } });
  });
  return { card: result, created: true };
}

// ─────────────────────────── Cupones ───────────────────────────

export function isPromotionLive(p: Promotion, now = new Date()) {
  if (!p.active) return false;
  if (p.startsAt && p.startsAt > now) return false;
  if (p.endsAt && p.endsAt < now) return false;
  return true;
}

function couponExpiry(p: Promotion) {
  const fromDays = p.validDays ? new Date(Date.now() + p.validDays * 864e5) : null;
  if (fromDays && p.endsAt) return fromDays < p.endsAt ? fromDays : p.endsAt;
  return fromDays ?? p.endsAt ?? null;
}

async function createCoupon(tx: Tx, p: Promotion, customerId: string, source = "manual") {
  return tx.customerCoupon.create({
    data: {
      source,
      code: newCouponCode(),
      authToken: newAuthToken(),
      promotionId: p.id,
      customerId,
      expiresAt: couponExpiry(p),
    },
  });
}

/** Entrega un cupón de la promoción a cada cliente indicado (omite a quien ya tiene uno activo). */
export async function issueCoupons(promotion: Promotion, customerIds: string[], source = "manual") {
  if (!isPromotionLive(promotion)) throw new LoyaltyError("La promoción no está vigente");
  const already = await db.customerCoupon.findMany({
    where: { promotionId: promotion.id, customerId: { in: customerIds }, status: "ACTIVE" },
    select: { customerId: true },
  });
  const skip = new Set(already.map((c) => c.customerId));
  const targets = customerIds.filter((id) => !skip.has(id));
  const expiresAt = couponExpiry(promotion);
  if (targets.length) {
    await db.customerCoupon.createMany({
      data: targets.map((customerId) => ({
        source,
        code: newCouponCode(),
        authToken: newAuthToken(),
        promotionId: promotion.id,
        customerId,
        expiresAt,
      })),
    });
  }
  return targets;
}

/**
 * El cliente reclama el cupón de una promoción escaneando su QR.
 * Una vez por cliente y promoción (un cupón revocado no cuenta), con límite total opcional.
 */
export async function claimPromotion(promotion: Promotion, customerId: string) {
  if (!promotion.claimEnabled || !isPromotionLive(promotion)) throw new LoyaltyError("Esta promoción ya no está disponible");
  return db.$transaction(async (tx) => {
    // Serializa los reclamos de la misma promoción para respetar el límite
    await tx.$queryRaw`SELECT id FROM "Promotion" WHERE id = ${promotion.id} FOR UPDATE`;
    const existing = await tx.customerCoupon.findFirst({
      where: { promotionId: promotion.id, customerId, status: { not: "VOID" } },
    });
    if (existing) return { coupon: existing, alreadyHad: true };
    if (promotion.claimLimit) {
      const claimed = await tx.customerCoupon.count({
        where: { promotionId: promotion.id, source: "qr", status: { not: "VOID" } },
      });
      if (claimed >= promotion.claimLimit) throw new LoyaltyError("Se agotaron los cupones de esta promoción");
    }
    const coupon = await createCoupon(tx, promotion, customerId, "qr");
    return { coupon, alreadyHad: false };
  });
}

/** Revoca cupones activos (entregados por error o de prueba). Devuelve los cupones revocados. */
export async function revokeCoupons(businessId: string, where: { couponId?: string; promotionId?: string }) {
  const coupons = await db.customerCoupon.findMany({
    where: {
      status: "ACTIVE",
      promotion: { businessId },
      ...(where.couponId ? { id: where.couponId } : {}),
      ...(where.promotionId ? { promotionId: where.promotionId } : {}),
    },
    select: { id: true, code: true, customerId: true },
  });
  if (coupons.length) {
    await db.customerCoupon.updateMany({
      where: { id: { in: coupons.map((c) => c.id) }, status: "ACTIVE" },
      data: { status: "VOID", revokedAt: new Date() },
    });
  }
  return coupons;
}

// ─────────────────────────── Operaciones del escáner ───────────────────────────

type StaffCtx = { staffId: string; businessId: string; locationId?: string | null; requestId?: string | null };

async function cardForBusiness(cardId: string, businessId: string) {
  const card = await db.loyaltyCard.findUnique({ where: { id: cardId } });
  if (!card || card.businessId !== businessId) throw new LoyaltyError("Tarjeta no encontrada");
  return card;
}

/** Registra una compra o visita y otorga puntos / cashback / sellos según el programa. */
export async function recordPurchase(ctx: StaffCtx, cardId: string, purchaseCents: number) {
  await cardForBusiness(cardId, ctx.businessId);
  const business = await db.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  if (business.programType !== "STAMPS" && purchaseCents <= 0) throw new LoyaltyError("Captura el monto de la compra");

  return db.$transaction(async (tx) => {
    const card = await lockCard(tx, cardId);
    const delta = computeEarn(business, card, purchaseCents);
    const desc =
      business.programType === "STAMPS"
        ? delta.stampsDelta !== 0 || delta.rewardsDelta !== 0
          ? "Sello por visita"
          : "Visita (sin sello por monto mínimo)"
        : "Compra";
    const t = await applyTx(tx, {
      ...ctx,
      cardId,
      type: purchaseCents > 0 ? "EARN" : "VISIT",
      delta,
      purchaseCents,
      description: desc,
      countsAsVisit: true,
    });
    return { tx: t, delta, earnedReward: delta.rewardsDelta > 0 };
  });
}

/** Tiempo máximo para deshacer desde el escáner (el escáner ofrece el botón menos tiempo). */
export const UNDO_WINDOW_MS = 2 * 60 * 1000;

/** Clave con la que queda constancia de que un registro se deshizo. */
export const undoKey = (requestId: string) => `${requestId}:undo`;

/**
 * Deshace una compra o visita registrada desde el escáner con `requestId`.
 * Solo procede si la registró el mismo usuario, sigue dentro de la ventana y es el último movimiento
 * de la tarjeta (así los saldos revierten exactos). Borra el registro original para que no cuente
 * en las métricas y deja un ajuste sin saldo como constancia.
 */
export async function undoPurchase(ctx: { staffId: string; businessId: string }, requestId: string) {
  return db.$transaction(async (tx) => {
    const orig = await tx.transaction.findUnique({ where: { requestId } });
    if (!orig || orig.businessId !== ctx.businessId) {
      const undone = await tx.transaction.findUnique({ where: { requestId: undoKey(requestId) } });
      throw new LoyaltyError(undone ? "Este registro ya se había deshecho" : "No se encontró el registro para deshacer");
    }
    if (orig.type !== "EARN" && orig.type !== "VISIT") throw new LoyaltyError("Solo se pueden deshacer compras y visitas");
    if (orig.staffId !== ctx.staffId) throw new LoyaltyError("Solo quien hizo el registro puede deshacerlo");
    if (Date.now() - orig.createdAt.getTime() > UNDO_WINDOW_MS)
      throw new LoyaltyError("Ya pasó el tiempo para deshacer. Pide al encargado un ajuste en el panel.");

    const card = await lockCard(tx, orig.cardId);
    const latest = await tx.transaction.findFirst({ where: { cardId: orig.cardId }, orderBy: { createdAt: "desc" } });
    if (latest?.id !== orig.id)
      throw new LoyaltyError("La tarjeta ya tuvo otro movimiento. Pide al encargado un ajuste en el panel.");
    if (
      card.points < orig.pointsDelta ||
      card.cashbackCents < orig.cashbackDelta ||
      card.stamps < orig.stampsDelta ||
      card.rewardsAvailable < orig.rewardsDelta
    )
      throw new LoyaltyError("No se puede deshacer: el saldo quedaría en negativo");

    const prevVisit = await tx.transaction.findFirst({
      where: { cardId: orig.cardId, type: { in: ["EARN", "VISIT"] }, id: { not: orig.id } },
      orderBy: { createdAt: "desc" },
    });
    await tx.loyaltyCard.update({
      where: { id: orig.cardId },
      data: {
        points: { decrement: orig.pointsDelta },
        lifetimePoints: { decrement: Math.max(0, orig.pointsDelta) },
        cashbackCents: { decrement: orig.cashbackDelta },
        stamps: { decrement: orig.stampsDelta },
        rewardsAvailable: { decrement: orig.rewardsDelta },
        totalSpentCents: { decrement: orig.purchaseCents },
        visits: { decrement: 1 },
        lastVisitAt: prevVisit?.createdAt ?? null,
      },
    });
    await tx.transaction.delete({ where: { id: orig.id } });
    const { currency } = await tx.business.findUniqueOrThrow({ where: { id: orig.businessId }, select: { currency: true } });
    const amount = orig.purchaseCents > 0 ? ` de ${formatMoney(orig.purchaseCents, currency)}` : "";
    await tx.transaction.create({
      data: {
        businessId: orig.businessId,
        cardId: orig.cardId,
        type: "ADJUST",
        description: `Se deshizo: ${orig.description}${amount}`,
        staffId: ctx.staffId,
        locationId: orig.locationId,
        requestId: undoKey(requestId),
      },
    });
    return { cardId: orig.cardId, description: orig.description };
  });
}

export async function redeemReward(ctx: StaffCtx, cardId: string, rewardId?: string) {
  await cardForBusiness(cardId, ctx.businessId);
  const business = await db.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const reward = rewardId
    ? await db.reward.findFirst({ where: { id: rewardId, businessId: ctx.businessId, active: true } })
    : null;
  if (business.programType === "POINTS" && !reward) throw new LoyaltyError("Selecciona una recompensa");

  return db.$transaction(async (tx) => {
    const card = await lockCard(tx, cardId);
    const delta = computeRedeemReward(business, card, reward?.pointsCost);
    return applyTx(tx, {
      ...ctx,
      cardId,
      type: "REDEEM_REWARD",
      delta,
      description: reward ? `Canje: ${reward.name}` : `Canje: ${business.stampReward}`,
      rewardId: reward?.id,
    });
  });
}

export async function redeemCashback(ctx: StaffCtx, cardId: string, amountCents: number) {
  await cardForBusiness(cardId, ctx.businessId);
  const business = await db.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  return db.$transaction(async (tx) => {
    const card = await lockCard(tx, cardId);
    const delta = computeRedeemCashback(business, card, amountCents);
    return applyTx(tx, { ...ctx, cardId, type: "REDEEM_CASHBACK", delta, description: "Uso de monedero" });
  });
}

export async function adjustBalance(ctx: StaffCtx, cardId: string, delta: Delta, note: string) {
  await cardForBusiness(cardId, ctx.businessId);
  return db.$transaction(async (tx) => {
    const card = await lockCard(tx, cardId);
    if (card.points + delta.pointsDelta < 0 || card.cashbackCents + delta.cashbackDelta < 0 || card.stamps + delta.stampsDelta < 0)
      throw new LoyaltyError("El ajuste dejaría el saldo en negativo");
    return applyTx(tx, { ...ctx, cardId, type: "ADJUST", delta, description: note || "Ajuste manual" });
  });
}

/** Canjea un cupón escaneado. Devuelve el cupón actualizado. */
export async function redeemCoupon(ctx: StaffCtx, code: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CustomerCoupon" WHERE code = ${code} FOR UPDATE`;
    const coupon = await tx.customerCoupon.findUnique({
      where: { code },
      include: { promotion: true, customer: { include: { card: true } } },
    });
    if (!coupon || coupon.promotion.businessId !== ctx.businessId) throw new LoyaltyError("Cupón no encontrado");
    if (coupon.status === "REDEEMED") throw new LoyaltyError("Este cupón ya fue canjeado");
    if (coupon.status === "VOID") throw new LoyaltyError("Este cupón fue revocado por el negocio");
    if (coupon.status !== "ACTIVE") throw new LoyaltyError("Este cupón no es válido");
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new LoyaltyError("Este cupón ya venció");
    if (coupon.promotion.startsAt && coupon.promotion.startsAt > new Date())
      throw new LoyaltyError("La promoción aún no inicia");

    const updated = await tx.customerCoupon.update({
      where: { id: coupon.id },
      data: { status: "REDEEMED", redeemedAt: new Date(), redeemedById: ctx.staffId },
      include: { promotion: true, customer: true },
    });
    if (coupon.customer.card) {
      await applyTx(tx, {
        ...ctx,
        cardId: coupon.customer.card.id,
        type: "COUPON",
        delta: { pointsDelta: 0, cashbackDelta: 0, stampsDelta: 0, rewardsDelta: 0 },
        description: `Cupón: ${coupon.promotion.title}`,
        couponId: coupon.id,
      });
    }
    return { coupon: updated, cardId: coupon.customer.card?.id ?? null };
  });
}
