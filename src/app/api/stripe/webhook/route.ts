// Webhook de Stripe: configura en el dashboard de Stripe el endpoint https://TU-DOMINIO/api/stripe/webhook
// con los eventos checkout.session.completed y customer.subscription.created/updated/deleted.
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { config } from "@/lib/config";
import { stripe, syncSubscription } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!config.stripe.enabled || !config.stripe.webhookSecret) return new NextResponse("Stripe no configurado", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig ?? "", config.stripe.webhookSecret);
  } catch (e) {
    return new NextResponse(`Firma inválida: ${(e as Error).message}`, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const sub = await stripe().subscriptions.retrieve(String(session.subscription));
        await syncSubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
  }
  return NextResponse.json({ received: true });
}
