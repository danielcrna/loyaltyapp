import "server-only";
import { db } from "../db";
import { config } from "../config";
import { pushPassUpdates } from "./apns";
import * as google from "./google";
import type { BusinessWithMedia } from "./apple";

/**
 * Orquesta la sincronización con las billeteras después de cada cambio:
 * - Apple: el pase se regenera bajo demanda; aquí solo se manda el push para que el iPhone lo descargue.
 * - Google: se actualiza el objeto vía API (y opcionalmente se envía mensaje con notificación).
 * Los errores se registran pero nunca rompen la operación principal.
 */

export async function loadBusinessForWallet(businessId: string): Promise<BusinessWithMedia> {
  return db.business.findUniqueOrThrow({
    where: { id: businessId },
    include: {
      logo: true,
      strip: true,
      stampIcon: true,
      stampEmptyIcon: true,
      locations: { where: { active: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

export async function activeCouponsFor(customerId: string) {
  return db.customerCoupon.findMany({
    where: { customerId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    include: { promotion: true },
    orderBy: { createdAt: "desc" },
  });
}

function logError(scope: string, e: unknown) {
  console.error(`[wallet:${scope}]`, e instanceof Error ? e.message : e);
}

/** Sincroniza la tarjeta de un cliente en Apple y Google. */
export async function syncCard(cardId: string, opts: { notifyBalance?: boolean; message?: { title: string; body: string } } = {}) {
  const card = await db.loyaltyCard.findUnique({ where: { id: cardId }, include: { customer: true } });
  if (!card) return;

  if (config.apple.enabled) {
    try {
      await pushPassUpdates([card.serial]);
    } catch (e) {
      logError("apple", e);
    }
  }

  if (config.google.enabled && card.googleSaved) {
    try {
      const business = await loadBusinessForWallet(card.businessId);
      const coupons = await activeCouponsFor(card.customerId);
      const exists = await google.patchObject(
        "loyaltyObject",
        google.buildLoyaltyObject(business, card, coupons),
        Boolean(opts.notifyBalance),
      );
      if (exists && opts.message) {
        await google.addObjectMessage("loyaltyObject", google.loyaltyObjectId(card), opts.message.title, opts.message.body);
      }
    } catch (e) {
      logError("google", e);
    }
  }
}

/** Sincroniza un cupón (por ejemplo, al canjearlo se marca como usado en la billetera). */
export async function syncCoupon(couponId: string) {
  const coupon = await db.customerCoupon.findUnique({ where: { id: couponId }, include: { promotion: true } });
  if (!coupon) return;
  if (config.apple.enabled) {
    try {
      await pushPassUpdates([coupon.code]);
    } catch (e) {
      logError("apple", e);
    }
  }
  if (config.google.enabled) {
    try {
      await google.patchObject("offerObject", google.buildOfferObject(coupon.promotion, coupon));
    } catch (e) {
      logError("google", e);
    }
  }
}

/** Publica el diseño del negocio en Google (clase) y fuerza la actualización de todos los pases. */
export async function syncBusinessDesign(businessId: string) {
  const business = await loadBusinessForWallet(businessId);
  if (config.google.enabled) {
    try {
      await google.upsertLoyaltyClass(business);
    } catch (e) {
      logError("google-class", e);
    }
  }
  // Apple: marcar todas las tarjetas como modificadas para que los iPhones descarguen el nuevo diseño.
  await db.loyaltyCard.updateMany({ where: { businessId }, data: { updatedAt: new Date() } });
  if (config.apple.enabled) {
    const cards = await db.loyaltyCard.findMany({ where: { businessId, appleInstalled: true }, select: { serial: true } });
    try {
      await pushPassUpdates(cards.map((c) => c.serial));
    } catch (e) {
      logError("apple", e);
    }
  }
}

/**
 * Envía un mensaje a todos los clientes del negocio:
 * - Apple: actualiza el campo "Novedades" (changeMessage "%@") de cada pase y manda push → notificación.
 * - Google: mensaje de clase TEXT_AND_NOTIFY (llega a todos los que guardaron el pase).
 */
export async function broadcastMessage(businessId: string, title: string, body: string, cardIds?: string[]) {
  const where = { businessId, ...(cardIds ? { id: { in: cardIds } } : {}) };
  const text = `${title}: ${body}`.slice(0, 300);
  await db.loyaltyCard.updateMany({ where, data: { lastMessage: text, updatedAt: new Date() } });
  const cards = await db.loyaltyCard.findMany({ where, select: { id: true, serial: true, googleSaved: true } });

  let appleSent = 0;
  let googleSent = 0;
  if (config.apple.enabled) {
    try {
      appleSent = await pushPassUpdates(cards.map((c) => c.serial));
    } catch (e) {
      logError("apple", e);
    }
  }
  if (config.google.enabled) {
    try {
      if (!cardIds) {
        const business = await loadBusinessForWallet(businessId);
        await google.addClassMessage(google.loyaltyClassId(business), title, body);
        googleSent = cards.filter((c) => c.googleSaved).length;
      } else {
        for (const c of cards.filter((c) => c.googleSaved)) {
          if (await google.addObjectMessage("loyaltyObject", google.loyaltyObjectId(c), title, body)) googleSent++;
        }
      }
    } catch (e) {
      logError("google", e);
    }
  }
  return { recipients: cards.length, appleSent, googleSent };
}

/**
 * Tras revocar cupones: marca el pase del cupón como no válido y actualiza la tarjeta de cada cliente
 * (que muestra cuántos cupones tiene disponibles).
 */
export async function syncRevokedCoupons(coupons: { id: string; code: string; customerId: string }[]) {
  if (!coupons.length) return;
  const cards = await db.loyaltyCard.findMany({
    where: { customerId: { in: [...new Set(coupons.map((c) => c.customerId))] } },
    select: { id: true, serial: true },
  });
  await db.loyaltyCard.updateMany({ where: { id: { in: cards.map((c) => c.id) } }, data: { updatedAt: new Date() } });
  if (config.apple.enabled) {
    try {
      await pushPassUpdates([...coupons.map((c) => c.code), ...cards.map((c) => c.serial)]);
    } catch (e) {
      logError("apple", e);
    }
  }
  if (config.google.enabled) {
    for (const c of coupons) await syncCoupon(c.id);
    for (const card of cards) await syncCard(card.id);
  }
}
