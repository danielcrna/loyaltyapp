"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { MANAGERS, requireBusinessUser } from "@/lib/auth";
import { broadcastMessage } from "@/lib/wallet/sync";
import type { ActionResult } from "@/components/action-form";

export async function sendBroadcastAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const title = String(fd.get("title") ?? "").trim().slice(0, 60);
  const message = String(fd.get("message") ?? "").trim().slice(0, 240);
  if (!title || !message) return { error: "Escribe un título y un mensaje" };

  const segment = String(fd.get("segment") ?? "all");
  let cardIds: string[] | undefined;
  if (segment === "inactive30") {
    const cutoff = new Date(Date.now() - 30 * 864e5);
    cardIds = (
      await db.loyaltyCard.findMany({
        where: { businessId: user.business.id, OR: [{ lastVisitAt: { lt: cutoff } }, { lastVisitAt: null }] },
        select: { id: true },
      })
    ).map((c) => c.id);
  } else if (segment === "rewardReady") {
    cardIds = (
      await db.loyaltyCard.findMany({
        where: { businessId: user.business.id, OR: [{ rewardsAvailable: { gt: 0 } }, { cashbackCents: { gt: 0 } }] },
        select: { id: true },
      })
    ).map((c) => c.id);
  }
  const recipients = cardIds ? cardIds.length : await db.loyaltyCard.count({ where: { businessId: user.business.id } });
  if (recipients === 0) return { error: "No hay clientes en ese segmento" };

  const campaign = await db.campaign.create({
    data: { businessId: user.business.id, title, message, recipients, createdById: user.id },
  });
  after(async () => {
    const r = await broadcastMessage(user.business.id, title, message, cardIds);
    await db.campaign.update({ where: { id: campaign.id }, data: { appleSent: r.appleSent, googleSent: r.googleSent } });
  });
  revalidatePath("/dashboard/notificaciones");
  return { ok: true, message: `Enviando a ${recipients} cliente(s)…` };
}
