import "server-only";
import { cookies } from "next/headers";
import { config } from "./config";
import { db } from "./db";

/**
 * Recuerda en el navegador del cliente cuál es su tarjeta en cada negocio (cookie httpOnly por negocio).
 * Así, al escanear el QR de una promoción, el cupón se agrega a su tarjeta con un solo toque.
 * Solo se puede llamar desde server actions o route handlers.
 */
const name = (businessId: string) => `lc_${businessId}`;

export async function rememberCard(businessId: string, serial: string) {
  (await cookies()).set(name(businessId), serial, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.appUrl.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function rememberedCard(businessId: string) {
  const serial = (await cookies()).get(name(businessId))?.value;
  if (!serial) return null;
  const card = await db.loyaltyCard.findUnique({ where: { serial }, include: { customer: true } });
  return card && card.businessId === businessId ? card : null;
}
