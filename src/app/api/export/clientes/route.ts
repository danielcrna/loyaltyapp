import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function csv(v: unknown) {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  // Evita inyección de fórmulas en Excel
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.business || user.role === "STAFF") return new NextResponse("No autorizado", { status: 401 });
  const b = user.business;
  const customers = await db.customer.findMany({ where: { businessId: b.id }, include: { card: true }, orderBy: { createdAt: "asc" } });
  const header = [
    "nombre", "telefono", "correo", "cumpleanos", "acepta_promociones", "fecha_alta", "codigo_tarjeta",
    "puntos", "saldo_monedero", "sellos", "recompensas_disponibles", "visitas", "consumo_total", "ultima_visita",
    "apple_wallet", "google_wallet",
  ];
  const rows = customers.map((c) =>
    [
      c.name, c.phone, c.email, c.birthday, c.marketingConsent ? "si" : "no", c.createdAt, c.card?.serial,
      c.card?.points, c.card ? (c.card.cashbackCents / 100).toFixed(2) : "", c.card?.stamps, c.card?.rewardsAvailable,
      c.card?.visits, c.card ? (c.card.totalSpentCents / 100).toFixed(2) : "", c.card?.lastVisitAt,
      c.card?.appleInstalled ? "si" : "no", c.card?.googleSaved ? "si" : "no",
    ]
      .map(csv)
      .join(","),
  );
  const body = "﻿" + [header.join(","), ...rows].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${b.slug}.csv"`,
    },
  });
}
