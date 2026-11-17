// Web service de Apple Wallet (https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes)
//
//   POST   v1/devices/{deviceId}/registrations/{passTypeId}/{serial}   registrar dispositivo (Authorization: ApplePass <token>)
//   DELETE v1/devices/{deviceId}/registrations/{passTypeId}/{serial}   dar de baja
//   GET    v1/devices/{deviceId}/registrations/{passTypeId}?passesUpdatedSince=tag   seriales actualizados
//   GET    v1/passes/{passTypeId}/{serial}                              descargar el pase más reciente
//   POST   v1/log                                                       errores reportados por el iPhone
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { buildCouponPass, buildLoyaltyPass } from "@/lib/wallet/apple";
import { activeCouponsFor, loadBusinessForWallet } from "@/lib/wallet/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Busca la tarjeta o cupón por serial y valida el token "ApplePass". */
async function findPass(serial: string, authHeader: string | null) {
  const token = authHeader?.replace(/^ApplePass\s+/i, "").trim();
  if (!token) return null;
  if (serial.startsWith("C")) {
    const card = await db.loyaltyCard.findUnique({ where: { serial } });
    if (!card || !sameToken(card.authToken, token)) return null;
    return { kind: "card" as const, card, updatedAt: card.updatedAt };
  }
  const coupon = await db.customerCoupon.findUnique({ where: { code: serial } });
  if (!coupon || !sameToken(coupon.authToken, token)) return null;
  return { kind: "coupon" as const, coupon, updatedAt: coupon.updatedAt };
}

const empty = (status: number) => new NextResponse(null, { status });

export async function POST(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  if (path[0] === "log") {
    const body = (await req.json().catch(() => ({}))) as { logs?: string[] };
    if (body.logs?.length) {
      await db.appleLog.createMany({ data: body.logs.slice(0, 20).map((m) => ({ message: String(m).slice(0, 2000) })) });
      console.warn("[apple-log]", body.logs);
    }
    return empty(200);
  }

  // devices/{deviceId}/registrations/{passTypeId}/{serial}
  if (path[0] !== "devices" || path[2] !== "registrations" || path.length !== 5) return empty(404);
  const [, deviceLibraryIdentifier, , passTypeIdentifier, serial] = path;
  if (passTypeIdentifier !== config.apple.passTypeId) return empty(404);
  const pass = await findPass(serial, req.headers.get("authorization"));
  if (!pass) return empty(401);

  const body = (await req.json().catch(() => ({}))) as { pushToken?: string };
  if (!body.pushToken) return empty(400);

  const device = await db.appleDevice.upsert({
    where: { deviceLibraryIdentifier },
    create: { deviceLibraryIdentifier, pushToken: body.pushToken },
    update: { pushToken: body.pushToken },
  });
  const existing = await db.appleRegistration.findUnique({
    where: { deviceId_passTypeIdentifier_serialNumber: { deviceId: device.id, passTypeIdentifier, serialNumber: serial } },
  });
  if (existing) return empty(200);
  await db.appleRegistration.create({ data: { deviceId: device.id, passTypeIdentifier, serialNumber: serial } });
  if (pass.kind === "card") await db.loyaltyCard.update({ where: { id: pass.card.id }, data: { appleInstalled: true, updatedAt: pass.card.updatedAt } });
  return empty(201);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  if (path[0] !== "devices" || path[2] !== "registrations" || path.length !== 5) return empty(404);
  const [, deviceLibraryIdentifier, , passTypeIdentifier, serial] = path;
  const pass = await findPass(serial, req.headers.get("authorization"));
  if (!pass) return empty(401);
  const device = await db.appleDevice.findUnique({ where: { deviceLibraryIdentifier } });
  if (device) {
    await db.appleRegistration.deleteMany({ where: { deviceId: device.id, passTypeIdentifier, serialNumber: serial } });
    const left = await db.appleRegistration.count({ where: { deviceId: device.id } });
    if (left === 0) await db.appleDevice.delete({ where: { id: device.id } });
  }
  if (pass.kind === "card") {
    const regs = await db.appleRegistration.count({ where: { serialNumber: serial } });
    if (regs === 0) await db.loyaltyCard.update({ where: { id: pass.card.id }, data: { appleInstalled: false, updatedAt: pass.card.updatedAt } });
  }
  return empty(200);
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { path } = await params;

  // devices/{deviceId}/registrations/{passTypeId}?passesUpdatedSince=tag
  if (path[0] === "devices" && path[2] === "registrations" && path.length === 4) {
    const [, deviceLibraryIdentifier, , passTypeIdentifier] = path;
    const device = await db.appleDevice.findUnique({
      where: { deviceLibraryIdentifier },
      include: { registrations: { where: { passTypeIdentifier } } },
    });
    if (!device || device.registrations.length === 0) return empty(204);
    const since = req.nextUrl.searchParams.get("passesUpdatedSince");
    const sinceDate = since && /^\d+$/.test(since) ? new Date(Number(since)) : null;
    const serials = device.registrations.map((r) => r.serialNumber);

    const [cards, coupons] = await Promise.all([
      db.loyaltyCard.findMany({
        where: { serial: { in: serials }, ...(sinceDate ? { updatedAt: { gt: sinceDate } } : {}) },
        select: { serial: true, updatedAt: true },
      }),
      db.customerCoupon.findMany({
        where: { code: { in: serials }, ...(sinceDate ? { updatedAt: { gt: sinceDate } } : {}) },
        select: { code: true, updatedAt: true },
      }),
    ]);
    const updated = [...cards.map((c) => ({ s: c.serial, u: c.updatedAt })), ...coupons.map((c) => ({ s: c.code, u: c.updatedAt }))];
    if (updated.length === 0) return empty(204);
    const lastUpdated = Math.max(...updated.map((x) => x.u.getTime()));
    return NextResponse.json({ serialNumbers: updated.map((x) => x.s), lastUpdated: String(lastUpdated) });
  }

  // passes/{passTypeId}/{serial}
  if (path[0] === "passes" && path.length === 3) {
    const [, passTypeIdentifier, serial] = path;
    if (passTypeIdentifier !== config.apple.passTypeId) return empty(404);
    const pass = await findPass(serial, req.headers.get("authorization"));
    if (!pass) return empty(401);

    const ims = req.headers.get("if-modified-since");
    const lastModified = new Date(Math.floor(pass.updatedAt.getTime() / 1000) * 1000);
    if (ims && new Date(ims).getTime() >= lastModified.getTime()) return empty(304);

    let buffer: Buffer;
    if (pass.kind === "card") {
      const card = await db.loyaltyCard.findUniqueOrThrow({ where: { id: pass.card.id }, include: { customer: true } });
      const business = await loadBusinessForWallet(card.businessId);
      buffer = await buildLoyaltyPass(business, card, await activeCouponsFor(card.customerId));
    } else {
      const coupon = await db.customerCoupon.findUniqueOrThrow({
        where: { id: pass.coupon.id },
        include: { promotion: { include: { image: true } }, customer: true },
      });
      const business = await loadBusinessForWallet(coupon.promotion.businessId);
      buffer = await buildCouponPass(business, coupon);
    }
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Last-Modified": lastModified.toUTCString(),
        "Cache-Control": "no-store",
      },
    });
  }

  return empty(404);
}
