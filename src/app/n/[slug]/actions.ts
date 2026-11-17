"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasActiveAccess } from "@/lib/billing";
import { enrollCustomer, LoyaltyError } from "@/lib/services";
import { rememberCard } from "@/lib/remember";
import { parseJoinForm, rateLimited } from "@/lib/public-forms";
import type { ActionResult } from "@/components/action-form";

export async function joinAction(slug: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (await rateLimited("join")) return { error: "Demasiados intentos. Intenta más tarde." };

  const business = await db.business.findUnique({ where: { slug } });
  if (!business || !hasActiveAccess(business)) return { error: "Este programa no está disponible" };

  const form = parseJoinForm(business, fd);
  if ("error" in form) return { error: form.error };

  let serial: string;
  try {
    const { card, created } = await enrollCustomer(business, form.data);
    if (!created) {
      return {
        error:
          "Ya tienes una tarjeta registrada con esos datos. Búscala en tu Apple Wallet / Google Wallet o pide en caja que te muestren el QR para recuperarla.",
      };
    }
    serial = card.serial;
    await rememberCard(business.id, card.serial);
  } catch (e) {
    if (e instanceof LoyaltyError) return { error: e.message };
    throw e;
  }
  redirect(`/tarjeta/${serial}?nueva=1`);
}
