"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { MANAGERS, requireBusinessUser } from "@/lib/auth";
import { normalizeUpload } from "@/lib/images";
import { issueCoupons, LoyaltyError } from "@/lib/services";
import { broadcastMessage } from "@/lib/wallet/sync";
import type { ActionResult } from "@/components/action-form";

const PromoSchema = z.object({
  title: z.string().trim().min(3, "Escribe un título").max(60),
  discountLabel: z.string().trim().max(20).default(""),
  description: z.string().trim().max(500).default(""),
  terms: z.string().trim().max(1000).default(""),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  validDays: z.string().optional(),
  autoAssign: z.enum(["NONE", "NEW_MEMBERS", "BIRTHDAY", "WINBACK"]).default("NONE"),
});

const toDate = (s?: string, endOfDay = false) => (s ? new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}-06:00`) : null);

export async function createPromotionAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const parsed = PromoSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let imageId: string | undefined;
  const file = fd.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > 3 * 1024 * 1024) return { error: "La imagen debe pesar menos de 3 MB" };
    const img = await normalizeUpload(Buffer.from(await file.arrayBuffer()), 1200);
    imageId = (
      await db.media.create({
        data: { businessId: user.business.id, mime: img.mime, data: new Uint8Array(img.data), width: img.width, height: img.height },
      })
    ).id;
  }
  const validDays = d.validDays ? Math.max(1, Math.floor(Number(d.validDays))) : null;
  await db.promotion.create({
    data: {
      businessId: user.business.id,
      title: d.title,
      discountLabel: d.discountLabel,
      description: d.description,
      terms: d.terms,
      startsAt: toDate(d.startsAt),
      endsAt: toDate(d.endsAt, true),
      validDays: Number.isFinite(validDays) ? validDays : null,
      autoAssign: d.autoAssign,
      imageId,
    },
  });
  revalidatePath("/dashboard/promociones");
  return { ok: true, message: "Promoción creada" };
}

export async function togglePromotionAction(fd: FormData) {
  const user = await requireBusinessUser(MANAGERS);
  const p = await db.promotion.findFirst({ where: { id: String(fd.get("id")), businessId: user.business.id } });
  if (p) await db.promotion.update({ where: { id: p.id }, data: { active: !p.active } });
  revalidatePath("/dashboard/promociones");
}

/** Entrega la promoción como cupón a todos los clientes y les avisa en su tarjeta. */
export async function sendPromotionAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const promo = await db.promotion.findFirst({ where: { id: String(fd.get("id")), businessId: user.business.id } });
  if (!promo) return { error: "Promoción no encontrada" };
  const message = String(fd.get("message") ?? "").trim() || `Tienes un nuevo cupón: ${promo.title}`;
  const customers = await db.customer.findMany({ where: { businessId: user.business.id }, select: { id: true } });
  try {
    const issued = await issueCoupons(promo, customers.map((c) => c.id));
    if (issued.length === 0) return { ok: true, message: "Todos tus clientes ya tenían este cupón activo." };
    const cards = await db.loyaltyCard.findMany({ where: { customerId: { in: issued } }, select: { id: true } });
    const campaign = await db.campaign.create({
      data: {
        businessId: user.business.id,
        title: promo.title,
        message,
        kind: "promotion",
        promotionId: promo.id,
        recipients: issued.length,
        createdById: user.id,
      },
    });
    after(async () => {
      const r = await broadcastMessage(user.business.id, "Nuevo cupón", message, cards.map((c) => c.id));
      await db.campaign.update({ where: { id: campaign.id }, data: { appleSent: r.appleSent, googleSent: r.googleSent } });
    });
    revalidatePath("/dashboard/promociones");
    return { ok: true, message: `Cupón entregado a ${issued.length} cliente(s). Recibirán una notificación en su tarjeta.` };
  } catch (e) {
    if (e instanceof LoyaltyError) return { error: e.message };
    throw e;
  }
}
