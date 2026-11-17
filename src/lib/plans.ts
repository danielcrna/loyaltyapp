// Planes que vendes a los negocios. Los precios se cobran con Stripe (price IDs en variables de entorno).
// Ajusta nombres, precios y límites a tu modelo de negocio.

export type PlanId = "starter" | "pro" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  priceMonthly: number; // MXN, solo informativo (el precio real vive en Stripe)
  stripePriceEnv: string;
  maxLocations: number;
  maxCustomers: number; // Infinity = ilimitado
  maxStaff: number;
  whiteLabel: boolean; // logotipo propio en el panel y la página de inscripción, sin marca Lealt.io
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Básico",
    priceMonthly: 399,
    stripePriceEnv: "STRIPE_PRICE_STARTER",
    maxLocations: 1,
    maxCustomers: 500,
    maxStaff: 3,
    whiteLabel: false,
    features: [
      "1 sucursal",
      "Hasta 500 clientes",
      "Apple Wallet y Google Wallet",
      "Sellos, puntos o monedero",
      "Cupones y promociones",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 899,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    maxLocations: 5,
    maxCustomers: 5000,
    maxStaff: 15,
    whiteLabel: false,
    features: [
      "Hasta 5 sucursales",
      "Hasta 5,000 clientes",
      "Notificaciones push a los pases",
      "Avisos por cercanía (geolocalización)",
      "Cumpleaños y recordatorios automáticos",
    ],
  },
  {
    id: "business",
    name: "Empresarial",
    priceMonthly: 1899,
    stripePriceEnv: "STRIPE_PRICE_BUSINESS",
    maxLocations: 10,
    maxCustomers: Number.POSITIVE_INFINITY,
    maxStaff: 100,
    whiteLabel: true,
    features: [
      "Hasta 10 sucursales",
      "Clientes ilimitados",
      "Todo lo de Pro",
      "Tu logotipo en el panel y la página de inscripción",
      "Soporte prioritario",
    ],
  },
];

export function getPlan(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function stripePriceId(plan: Plan): string | undefined {
  return process.env[plan.stripePriceEnv] || undefined;
}

export function planForPriceId(priceId: string | null | undefined): Plan | undefined {
  if (!priceId) return undefined;
  return PLANS.find((p) => stripePriceId(p) === priceId);
}

/**
 * Marca que se muestra al negocio y a sus clientes.
 * Plan Empresarial (whiteLabel): su logotipo de marca (o el de la tarjeta) y sin la leyenda de la plataforma.
 */
export function brandFor(b: { plan: string; brandLogoId: string | null; logoId: string | null }) {
  const whiteLabel = getPlan(b.plan).whiteLabel;
  const logoId = whiteLabel ? (b.brandLogoId ?? b.logoId) : null;
  return { whiteLabel, logoUrl: logoId ? `/api/media/${logoId}` : null };
}
