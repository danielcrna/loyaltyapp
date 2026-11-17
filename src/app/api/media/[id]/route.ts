import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const media = await db.media.findUnique({ where: { id } });
  if (!media) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(media.data), {
    headers: { "Content-Type": media.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
