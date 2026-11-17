// Imagen de sellos de una tarjeta (heroImage de Google Wallet y vista previa en la web).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderStampStrip } from "@/lib/images";
import { stampRules } from "@/lib/loyalty";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const card = await db.loyaltyCard.findUnique({
    where: { serial },
    include: { business: { include: { strip: true, stampIcon: true, stampEmptyIcon: true } } },
  });
  if (!card) return new NextResponse("No encontrado", { status: 404 });
  const b = card.business;
  const png = await renderStampStrip({
    width: 1032,
    height: 336,
    stamps: card.stamps,
    required: b.stampsRequired,
    bg: b.bgColor,
    fg: b.fgColor,
    accent: b.labelColor,
    background: b.strip ? Buffer.from(b.strip.data) : null,
    tierMarks: stampRules(b).filter((r) => !r.final).map((r) => r.stamps),
    ...(b.stampStyle === "custom" && b.stampIcon
      ? {
          stampImage: Buffer.from(b.stampIcon.data),
          emptyImage: b.stampEmptyIcon ? Buffer.from(b.stampEmptyIcon.data) : null,
        }
      : {}),
  });
  // La URL incluye el número de sellos (?s=), así que puede cachearse.
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
