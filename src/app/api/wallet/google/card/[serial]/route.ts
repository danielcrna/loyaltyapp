import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { buildLoyaltyClass, buildLoyaltyObject, saveUrl, upsertLoyaltyClass } from "@/lib/wallet/google";
import { activeCouponsFor, loadBusinessForWallet } from "@/lib/wallet/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  if (!config.google.enabled) return new NextResponse("Google Wallet aún no está configurado", { status: 503 });
  const card = await db.loyaltyCard.findUnique({ where: { serial }, include: { customer: true } });
  if (!card) return new NextResponse("No encontrado", { status: 404 });
  const business = await loadBusinessForWallet(card.businessId);
  const object = buildLoyaltyObject(business, card, await activeCouponsFor(card.customerId));
  let url: string;
  try {
    await upsertLoyaltyClass(business); // garantiza que la clase exista con el diseño vigente
    url = await saveUrl({ loyaltyObjects: [object] });
  } catch (e) {
    // Si la API no responde, se envía la clase dentro del JWT (Google la crea al guardar).
    console.error("[google] upsert class", (e as Error).message);
    url = await saveUrl({ loyaltyClasses: [buildLoyaltyClass(business)], loyaltyObjects: [object] });
  }
  await db.loyaltyCard.update({ where: { id: card.id }, data: { googleSaved: true, updatedAt: card.updatedAt } });
  return NextResponse.redirect(url, 302);
}
