"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { hasActiveAccess } from "@/lib/billing";
import { claimPromotion, enrollCustomer, isPromotionLive, LoyaltyError, normalizePhone } from "@/lib/services";
import { rememberCard, rememberedCard } from "@/lib/remember";
import { parseJoinForm, rateLimited } from "@/lib/public-forms";
import { syncCard } from "@/lib/wallet/sync";
import type { ActionResult } from "@/components/action-form";

const ADDED_MESSAGE =
  "¡Listo! El cupón se agregó a tu tarjeta. Ábrela desde Apple Wallet o Google Wallet (o desde el enlace de tu tarjeta) para verlo y canjearlo en caja.";

async function loadPromo(token: string) {
  const promo = await db.promotion.findUnique({ where: { claimToken: token }, include: { business: true } });
  if (!promo || !promo.claimEnabled || !isPromotionLive(promo) || !hasActiveAccess(promo.business)) {
    throw new LoyaltyError("Esta promoción ya no está disponible");
  }
  return promo;
}

async function claimFor(promo: Awaited<ReturnType<typeof loadPromo>>, customerId: string) {
  const r = await claimPromotion(promo, customerId);
  const card = await db.loyaltyCard.findUnique({ where: { customerId }, select: { id: true } });
  // Actualiza el pase: aparece el cupón y iOS avisa "Tienes N cupones"
  if (card && !r.alreadyHad) after(() => syncCard(card.id));
  return r;
}

function fail(e: unknown): ActionResult {
  if (e instanceof LoyaltyError) return { error: e.message };
  throw e;
}

/** El navegador ya conoce la tarjeta del cliente: agrega el cupón con un toque. */
export async function claimRememberedAction(token: string, _prev: ActionResult): Promise<ActionResult> {
  let code: string;
  try {
    const promo = await loadPromo(token);
    const card = await rememberedCard(promo.businessId);
    if (!card) return { error: "No encontramos tu tarjeta en este celular. Usa una de las opciones de abajo." };
    const r = await claimFor(promo, card.customerId);
    code = r.coupon.code;
  } catch (e) {
    return fail(e);
  }
  redirect(`/cupon/${code}?nuevo=1`);
}

/**
 * Cliente con tarjeta, pero en otro dispositivo: lo identificamos por teléfono o correo.
 * No mostramos su tarjeta ni el cupón aquí (no hay verificación), solo confirmamos que se agregó.
 */
export async function claimWithContactAction(token: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (await rateLimited("claim-contact", 8)) return { error: "Demasiados intentos. Intenta más tarde." };
  try {
    const promo = await loadPromo(token);
    const raw = String(fd.get("contact") ?? "").trim();
    if (raw.length < 5) return { error: "Escribe tu teléfono o correo" };
    const isEmail = raw.includes("@");
    const customer = await db.customer.findFirst({
      where: {
        businessId: promo.businessId,
        ...(isEmail ? { email: raw.toLowerCase() } : { phone: normalizePhone(raw) ?? "__none__" }),
      },
      include: { card: true },
    });
    if (!customer?.card) return { error: "No encontramos una tarjeta con esos datos. Si eres nuevo, inscríbete con el formulario." };
    const r = await claimFor(promo, customer.id);
    return { ok: true, message: r.alreadyHad ? "Ya tenías este cupón en tu tarjeta." : ADDED_MESSAGE };
  } catch (e) {
    return fail(e);
  }
}

/** Cliente nuevo: se inscribe y recibe el cupón en el mismo paso. */
export async function joinAndClaimAction(token: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (await rateLimited("join")) return { error: "Demasiados intentos. Intenta más tarde." };
  let redirectTo: string;
  try {
    const promo = await loadPromo(token);
    const form = parseJoinForm(promo.business, fd);
    if ("error" in form) return { error: form.error };
    const { card, created } = await enrollCustomer(promo.business, form.data);
    const r = await claimFor(promo, card.customerId);
    if (!created) {
      // Ya existía: no revelamos su tarjeta en este dispositivo
      return { ok: true, message: r.alreadyHad ? "Ya tenías este cupón en tu tarjeta." : `Ya tenías tarjeta con esos datos. ${ADDED_MESSAGE}` };
    }
    await rememberCard(promo.businessId, card.serial);
    redirectTo = `/tarjeta/${card.serial}?nueva=1`;
  } catch (e) {
    return fail(e);
  }
  redirect(redirectTo);
}
