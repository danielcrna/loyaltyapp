import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { buildLoyaltyPass } from "@/lib/wallet/apple";
import { activeCouponsFor, loadBusinessForWallet } from "@/lib/wallet/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  if (!config.apple.enabled) return new NextResponse("Apple Wallet aún no está configurado", { status: 503 });
  const card = await db.loyaltyCard.findUnique({ where: { serial }, include: { customer: true } });
  if (!card) return new NextResponse("No encontrado", { status: 404 });
  const business = await loadBusinessForWallet(card.businessId);
  const buf = await buildLoyaltyPass(business, card, await activeCouponsFor(card.customerId));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${serial}.pkpass"`,
      "Cache-Control": "no-store",
    },
  });
}
