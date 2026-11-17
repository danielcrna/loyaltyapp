// Logo cuadrado del negocio (Google Wallet lo recorta en círculo; recomendado 660x660).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderIcon } from "@/lib/images";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const b = await db.business.findUnique({ where: { id: businessId }, include: { logo: true } });
  if (!b) return new NextResponse("No encontrado", { status: 404 });
  const png = await renderIcon(660, {
    logo: b.logo ? Buffer.from(b.logo.data) : null,
    name: b.name,
    bg: b.bgColor,
    fg: b.fgColor,
  });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
