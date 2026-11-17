import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { buildOfferClass, buildOfferObject, saveUrl, upsertOfferClass } from "@/lib/wallet/google";
import { loadBusinessForWallet } from "@/lib/wallet/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!config.google.enabled) return new NextResponse("Google Wallet aún no está configurado", { status: 503 });
  const coupon = await db.customerCoupon.findUnique({ where: { code }, include: { promotion: true } });
  if (!coupon) return new NextResponse("No encontrado", { status: 404 });
  const business = await loadBusinessForWallet(coupon.promotion.businessId);
  const object = buildOfferObject(coupon.promotion, coupon);
  let url: string;
  try {
    await upsertOfferClass(business, coupon.promotion);
    url = await saveUrl({ offerObjects: [object] });
  } catch (e) {
    console.error("[google] upsert offer class", (e as Error).message);
    url = await saveUrl({ offerClasses: [buildOfferClass(business, coupon.promotion)], offerObjects: [object] });
  }
  return NextResponse.redirect(url, 302);
}
