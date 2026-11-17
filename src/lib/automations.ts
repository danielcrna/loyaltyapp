import "server-only";
import { db } from "./db";
import { issueCoupons, isPromotionLive } from "./services";
import { broadcastMessage } from "./wallet/sync";

/**
 * Tareas automáticas (ejecutar una vez al día vía /api/cron):
 * 1. Expirar cupones vencidos.
 * 2. Cumpleaños: entregar cupones BIRTHDAY y enviar felicitación al pase.
 * 3. Recordatorio de inactividad ("te extrañamos") + cupones WINBACK.
 */
export async function runDailyAutomations(now = new Date()) {
  const report = { expiredCoupons: 0, birthdays: 0, winback: 0, businesses: 0 };

  const expired = await db.customerCoupon.updateMany({
    where: { status: "ACTIVE", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  report.expiredCoupons = expired.count;

  const businesses = await db.business.findMany({
    where: { subscriptionStatus: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
    include: { promotions: { where: { active: true, autoAssign: { in: ["BIRTHDAY", "WINBACK"] } } } },
  });

  for (const b of businesses) {
    report.businesses++;
    // Fecha local del negocio
    const local = new Date(now.toLocaleString("en-US", { timeZone: b.timezone }));
    const month = local.getMonth() + 1;
    const day = local.getDate();
    const year = local.getFullYear();

    // ── Cumpleaños ──
    const bdays = await db.$queryRaw<{ id: string; customerId: string }[]>`
      SELECT c.id, c."customerId" FROM "LoyaltyCard" c
      JOIN "Customer" cu ON cu.id = c."customerId"
      WHERE c."businessId" = ${b.id}
        AND cu.birthday IS NOT NULL
        AND EXTRACT(MONTH FROM cu.birthday) = ${month}
        AND EXTRACT(DAY FROM cu.birthday) = ${day}
        AND (c."lastBirthdayYear" IS NULL OR c."lastBirthdayYear" < ${year})`;
    if (bdays.length) {
      for (const p of b.promotions.filter((p) => p.autoAssign === "BIRTHDAY" && isPromotionLive(p, now))) {
        await issueCoupons(p, bdays.map((x) => x.customerId));
      }
      await db.loyaltyCard.updateMany({ where: { id: { in: bdays.map((x) => x.id) } }, data: { lastBirthdayYear: year } });
      await broadcastMessage(b.id, "¡Feliz cumpleaños!", b.birthdayMessage, bdays.map((x) => x.id));
      report.birthdays += bdays.length;
    }

    // ── Recordatorio por inactividad ──
    if (b.winbackDays > 0) {
      const cutoff = new Date(now.getTime() - b.winbackDays * 864e5);
      const inactive = await db.loyaltyCard.findMany({
        where: {
          businessId: b.id,
          OR: [{ lastVisitAt: { lt: cutoff } }, { lastVisitAt: null, createdAt: { lt: cutoff } }],
          AND: [{ OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }] }],
        },
        select: { id: true, customerId: true },
        take: 2000,
      });
      if (inactive.length) {
        for (const p of b.promotions.filter((p) => p.autoAssign === "WINBACK" && isPromotionLive(p, now))) {
          await issueCoupons(p, inactive.map((x) => x.customerId));
        }
        await db.loyaltyCard.updateMany({ where: { id: { in: inactive.map((x) => x.id) } }, data: { lastReminderAt: now } });
        await broadcastMessage(b.id, b.name, b.winbackMessage, inactive.map((x) => x.id));
        report.winback += inactive.length;
      }
    }
  }
  return report;
}
