// Franja de sellos del negocio para N sellos: es la MISMA imagen que lleva el pase de Apple Wallet,
// así la vista previa del panel y la tarjeta web se ven idénticas al pase.
// La imagen solo depende del diseño del negocio y del número de sellos (?s=), no del cliente.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderStampStrip } from "@/lib/images";
import { stampRules } from "@/lib/loyalty";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const b = await db.business.findUnique({
    where: { id: businessId },
    include: { strip: true, stampIcon: true, stampEmptyIcon: true },
  });
  if (!b) return new NextResponse("No encontrado", { status: 404 });
  const s = Math.max(0, Math.min(b.stampsRequired, Math.floor(Number(req.nextUrl.searchParams.get("s")) || 0)));
  const png = await renderStampStrip({
    width: 1125, // 375 × 123 pt @3x, igual que el strip del pase de Apple
    height: 369,
    stamps: s,
    required: b.stampsRequired,
    bg: b.bgColor,
    fg: b.fgColor,
    accent: b.labelColor,
    background: b.strip ? Buffer.from(b.strip.data) : null,
    tierMarks: stampRules(b).filter((r) => !r.final).map((r) => r.stamps),
    ...(b.stampStyle === "custom" && b.stampIcon
      ? { stampImage: Buffer.from(b.stampIcon.data), emptyImage: b.stampEmptyIcon ? Buffer.from(b.stampEmptyIcon.data) : null }
      : {}),
  });
  // La URL incluye ?v=<última modificación del negocio>, así que puede guardarse en caché.
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
