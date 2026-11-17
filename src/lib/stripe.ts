import "server-only";
import Stripe from "stripe";
import type { Business, SubscriptionStatus } from "@prisma/client";
import { config } from "./config";
import { db } from "./db";
import { getPlan, planForPriceId, stripePriceId, type PlanId } from "./plans";

let client: Stripe | null = null;
export function stripe() {
  if (!config.stripe.secretKey) throw new Error("Stripe no está configurado");
  client ??= new Stripe(config.stripe.secretKey);
  return client;
}

async function ensureCustomer(business: Business, email: string) {
  if (business.stripeCustomerId) return business.stripeCustomerId;
  const customer = await stripe().customers.create({
    name: business.name,
    email,
    metadata: { businessId: business.id },
  });
  await db.business.update({ where: { id: business.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/** Crea una sesión de Stripe Checkout para suscribir al negocio a un plan. */
export async function createCheckoutSession(business: Business, email: string, planId: PlanId) {
  const plan = getPlan(planId);
  const price = stripePriceId(plan);
  if (!price) throw new Error(`Falta la variable ${plan.stripePriceEnv} con el Price ID de Stripe`);
  const customer = await ensureCustomer(business, email);
  const trialEnd =
    business.subscriptionStatus === "TRIALING" && business.trialEndsAt && business.trialEndsAt.getTime() > Date.now() + 864e5
      ? Math.floor(business.trialEndsAt.getTime() / 1000)
      : undefined;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: business.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { businessId: business.id, plan: plan.id }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    allow_promotion_codes: true,
    locale: "es-419",
    success_url: `${config.appUrl}/dashboard/facturacion?estado=ok`,
    cancel_url: `${config.appUrl}/dashboard/facturacion?estado=cancelado`,
  });
  return session.url!;
}

export async function createPortalSession(business: Business) {
  if (!business.stripeCustomerId) throw new Error("El negocio aún no tiene cliente en Stripe");
  const session = await stripe().billingPortal.sessions.create({
    customer: business.stripeCustomerId,
    return_url: `${config.appUrl}/dashboard/facturacion`,
  });
  return session.url;
}

function mapStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "incomplete":
      return "INCOMPLETE";
    default:
      return "CANCELED";
  }
}

/** Sincroniza el estado de la suscripción de Stripe en el negocio. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const businessId =
    sub.metadata?.businessId ??
    (await db.business.findFirst({ where: { stripeCustomerId: String(sub.customer) } }))?.id;
  if (!businessId) return;
  const item = sub.items.data[0];
  const plan = planForPriceId(item?.price?.id);
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end;
  await db.business.update({
    where: { id: businessId },
    data: {
      stripeSubscriptionId: sub.id,
      stripeCustomerId: String(sub.customer),
      subscriptionStatus: mapStatus(sub.status),
      ...(plan ? { plan: plan.id } : {}),
      ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
      ...(sub.trial_end ? { trialEndsAt: new Date(sub.trial_end * 1000) } : {}),
    },
  });
}
