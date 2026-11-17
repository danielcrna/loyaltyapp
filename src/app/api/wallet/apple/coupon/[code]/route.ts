import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { buildCouponPass } from "@/lib/wallet/apple";
import { loadBusinessForWallet } from "@/lib/wallet/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!config.apple.enabled) return new NextResponse("Apple Wallet aún no está configurado", { status: 503 });
  const coupon = await db.customerCoupon.findUnique({
    where: { code },
    include: { promotion: { include: { image: true } }, customer: true },
  });
  if (!coupon) return new NextResponse("No encontrado", { status: 404 });
  const business = await loadBusinessForWallet(coupon.promotion.businessId);
  const buf = await buildCouponPass(business, coupon);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${code}.pkpass"`,
      "Cache-Control": "no-store",
    },
  });
}
