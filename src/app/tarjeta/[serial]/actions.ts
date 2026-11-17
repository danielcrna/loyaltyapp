"use server";

import { db } from "@/lib/db";
import { rememberCard } from "@/lib/remember";

export async function rememberCardAction(serial: string) {
  const card = await db.loyaltyCard.findUnique({ where: { serial }, select: { businessId: true, serial: true } });
  if (card) await rememberCard(card.businessId, card.serial);
}
