"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { MANAGERS, requireBusinessUser } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/format";
import { adjustBalance, enrollCustomer, issueCoupons, LoyaltyError, normalizePhone, revokeCoupons } from "@/lib/services";
import { broadcastMessage, syncCard, syncRevokedCoupons } from "@/lib/wallet/sync";
import type { ActionResult } from "@/components/action-form";

function parseBirthday(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
}

export async function addCustomerAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Escribe el nombre del cliente" };
  try {
    const { card, created } = await enrollCustomer(user.business, {
      name,
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      birthday: parseBirthday(fd.get("birthday")),
      marketingConsent: fd.get("consent") === "on",
      source: "staff",
    });
    if (!created) return { error: "Ya existe un cliente con ese correo o teléfono" };
    redirect(`/dashboard/clientes/${card.customerId}`);
  } catch (e) {
    if (e instanceof LoyaltyError) return { error: e.message };
    throw e;
  }
}

async function ownCustomer(businessId: string, id: string) {
  const c = await db.customer.findFirst({ where: { id, businessId }, include: { card: true } });
  if (!c) throw new LoyaltyError("Cliente no encontrado");
  return c;
}

export async function updateCustomerAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const c = await ownCustomer(user.business.id, String(fd.get("id")));
  const email = String(fd.get("email") ?? "").trim().toLowerCase() || null;
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  try {
    await db.customer.update({
      where: { id: c.id },
      data: {
        name: String(fd.get("name") ?? c.name).trim() || c.name,
        email,
        phone,
        birthday: parseBirthday(fd.get("birthday")),
        marketingConsent: fd.get("consent") === "on",
        notes: String(fd.get("notes") ?? ""),
      },
    });
  } catch {
    return { error: "Ese correo o teléfono ya pertenece a otro cliente" };
  }
  if (c.card) after(() => syncCard(c.card!.id));
  revalidatePath(`/dashboard/clientes/${c.id}`);
  return { ok: true, message: "Datos actualizados" };
}

export async function adjustAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const c = await ownCustomer(user.business.id, String(fd.get("id")));
  if (!c.card) return { error: "El cliente no tiene tarjeta" };
  const sign = fd.get("sign") === "minus" ? -1 : 1;
  const amount = String(fd.get("amount") ?? "0");
  const t = user.business.programType;
  const delta = {
    pointsDelta: t === "POINTS" ? sign * Math.floor(Number(amount) || 0) : 0,
    cashbackDelta: t === "CASHBACK" ? sign * parseMoneyToCents(amount) : 0,
    stampsDelta: t === "STAMPS" ? sign * Math.floor(Number(amount) || 0) : 0,
    rewardsDelta: 0,
  };
  if (t === "STAMPS" && c.card.stamps + delta.stampsDelta >= user.business.stampsRequired)
    return { error: `Máximo ${user.business.stampsRequired - 1 - c.card.stamps} sellos con ajuste manual; registra visitas para completar la tarjeta.` };
  try {
    await adjustBalance({ staffId: user.id, businessId: user.business.id }, c.card.id, delta, String(fd.get("note") ?? ""));
  } catch (e) {
    if (e instanceof LoyaltyError) return { error: e.message };
    throw e;
  }
  after(() => syncCard(c.card!.id, { notifyBalance: true }));
  revalidatePath(`/dashboard/clientes/${c.id}`);
  return { ok: true, message: "Ajuste aplicado" };
}

export async function messageCustomerAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const c = await ownCustomer(user.business.id, String(fd.get("id")));
  const message = String(fd.get("message") ?? "").trim().slice(0, 240);
  if (!c.card || !message) return { error: "Escribe un mensaje" };
  after(() => broadcastMessage(user.business.id, user.business.name, message, [c.card!.id]));
  return { ok: true, message: "Mensaje enviado a la tarjeta" };
}

export async function giveCouponAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const c = await ownCustomer(user.business.id, String(fd.get("id")));
  const promo = await db.promotion.findFirst({ where: { id: String(fd.get("promotionId")), businessId: user.business.id } });
  if (!promo) return { error: "Selecciona una promoción" };
  try {
    const issued = await issueCoupons(promo, [c.id]);
    if (!issued.length) return { error: "El cliente ya tiene ese cupón activo" };
  } catch (e) {
    if (e instanceof LoyaltyError) return { error: e.message };
    throw e;
  }
  if (c.card) after(() => broadcastMessage(user.business.id, "Nuevo cupón", `Tienes un nuevo cupón: ${promo.title}`, [c.card!.id]));
  revalidatePath(`/dashboard/clientes/${c.id}`);
  return { ok: true, message: "Cupón entregado" };
}

/** Elimina al cliente y todos sus datos (derecho de cancelación — LFPDPPP). */
export async function deleteCustomerAction(fd: FormData) {
  const user = await requireBusinessUser(["OWNER"]);
  const c = await ownCustomer(user.business.id, String(fd.get("id")));
  await db.customer.delete({ where: { id: c.id } });
  revalidatePath("/dashboard/clientes");
  redirect("/dashboard/clientes");
}

/** Revoca un cupón activo de un cliente (entregado por error o de prueba). */
export async function revokeCouponAction(fd: FormData) {
  const user = await requireBusinessUser(MANAGERS);
  const revoked = await revokeCoupons(user.business.id, { couponId: String(fd.get("couponId")) });
  if (revoked.length) after(() => syncRevokedCoupons(revoked));
  revalidatePath(`/dashboard/clientes/${String(fd.get("customerId"))}`);
}
