"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasActiveAccess } from "@/lib/billing";
import { enrollCustomer, LoyaltyError } from "@/lib/services";
import type { ActionResult } from "@/components/action-form";

// Límite simple en memoria por IP (suficiente para una instancia; usa Redis/Upstash si escalas a varias).
const hits = new Map<string, { n: number; at: number }>();
function rateLimited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 10 * 60_000) {
    hits.set(ip, { n: 1, at: now });
    return false;
  }
  h.n++;
  return h.n > 10;
}

const JoinSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(80),
  phone: z.string().trim().max(20).optional(),
  email: z.union([z.literal(""), z.email("Correo inválido")]).optional(),
  birthday: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});

export async function joinAction(slug: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (fd.get("website")) return { error: "Error de validación" }; // honeypot anti-bots
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) return { error: "Demasiados intentos. Intenta más tarde." };

  const business = await db.business.findUnique({ where: { slug } });
  if (!business || !hasActiveAccess(business)) return { error: "Este programa no está disponible" };

  const parsed = JoinSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (business.askPhone && !d.phone) return { error: "Escribe tu teléfono" };
  if (business.askEmail && !business.askPhone && !d.email) return { error: "Escribe tu correo" };
  if (fd.get("privacy") !== "on") return { error: "Debes aceptar el aviso de privacidad" };

  let serial: string;
  try {
    const { card, created } = await enrollCustomer(business, {
      name: d.name,
      phone: d.phone,
      email: d.email || null,
      birthday: d.birthday ? new Date(`${d.birthday}T00:00:00Z`) : null,
      marketingConsent: fd.get("marketing") === "on",
      source: "qr",
    });
    if (!created) {
      return {
        error:
          "Ya tienes una tarjeta registrada con esos datos. Búscala en tu Apple Wallet / Google Wallet o pide en caja que te muestren el QR para recuperarla.",
      };
    }
    serial = card.serial;
  } catch (e) {
    if (e instanceof LoyaltyError) return { error: e.message };
    throw e;
  }
  redirect(`/tarjeta/${serial}?nueva=1`);
}
