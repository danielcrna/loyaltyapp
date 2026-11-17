// Datos de demostración: npm run db:seed
// Crea un superadmin, un negocio demo con dueño y cajero, sucursales, promociones y clientes.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const code = (n: number) => Array.from(randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join("");

async function main() {
  const pw = await bcrypt.hash("demo1234", 10);

  await db.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: { email: "admin@demo.com", name: "Superadmin", passwordHash: pw, isSuperAdmin: true },
  });

  const existing = await db.business.findUnique({ where: { slug: "cafe-demo" } });
  if (existing) {
    console.log("El negocio demo ya existe. Nada que hacer.");
    return;
  }

  const business = await db.business.create({
    data: {
      name: "Café Demo",
      slug: "cafe-demo",
      email: "dueno@demo.com",
      phone: "55 1234 5678",
      programType: "STAMPS",
      programName: "Club del Café",
      stampsRequired: 8,
      stampReward: "Un café de especialidad gratis",
      welcomeBonus: 1,
      bgColor: "#3b2416",
      fgColor: "#fff8f0",
      labelColor: "#f2b84b",
      programTerms: "Un sello por visita. Recompensa válida en cualquier sucursal.",
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 30 * 864e5),
      users: {
        create: [
          { email: "dueno@demo.com", name: "Dueño Demo", passwordHash: pw, role: "OWNER" },
          { email: "cajero@demo.com", name: "Cajero Demo", passwordHash: pw, role: "STAFF" },
        ],
      },
      locations: {
        create: [
          { name: "Sucursal Roma", address: "Álvaro Obregón 100, Roma Nte., CDMX", latitude: 19.4194, longitude: -99.1617, relevantText: "☕ Estás cerca del Café Demo: tu próximo sello te espera" },
          { name: "Sucursal Condesa", address: "Av. Michoacán 50, Condesa, CDMX", latitude: 19.4111, longitude: -99.1716 },
        ],
      },
      rewards: { create: [{ name: "Café americano", pointsCost: 50 }, { name: "Pan dulce", pointsCost: 80 }] },
      promotions: {
        create: [
          { title: "2x1 en capuchinos", discountLabel: "2x1", description: "Válido de lunes a jueves", validDays: 14 },
          { title: "Postre de cumpleaños", discountLabel: "GRATIS", autoAssign: "BIRTHDAY", validDays: 30 },
        ],
      },
    },
  });

  const names = ["Ana López", "Carlos Pérez", "María García", "Jorge Hernández", "Lucía Martínez"];
  for (const [i, name] of names.entries()) {
    const customer = await db.customer.create({
      data: {
        businessId: business.id,
        name,
        phone: `551000000${i}`,
        email: `cliente${i}@ejemplo.com`,
        marketingConsent: true,
        birthday: new Date(Date.UTC(1990 + i, i, 10 + i)),
      },
    });
    const stamps = (i * 3) % 8;
    const card = await db.loyaltyCard.create({
      data: {
        serial: `C${code(14)}`,
        authToken: randomBytes(24).toString("hex"),
        businessId: business.id,
        customerId: customer.id,
        stamps,
        visits: stamps + i,
        lastVisitAt: new Date(Date.now() - i * 9 * 864e5),
      },
    });
    for (let v = 0; v < stamps; v++) {
      await db.transaction.create({
        data: {
          businessId: business.id,
          cardId: card.id,
          type: "VISIT",
          stampsDelta: 1,
          description: "Sello por visita",
          createdAt: new Date(Date.now() - (v + 1) * 2 * 864e5),
        },
      });
    }
  }
  console.log("Listo. Accesos (contraseña demo1234):");
  console.log("  Superadmin: admin@demo.com");
  console.log("  Dueño:      dueno@demo.com");
  console.log("  Cajero:     cajero@demo.com");
  console.log("  Inscripción: /n/cafe-demo");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
