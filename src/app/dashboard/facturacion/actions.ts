"use server";

import { redirect } from "next/navigation";
import { requireBusinessUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { createCheckoutSession, createPortalSession } from "@/lib/stripe";
import type { PlanId } from "@/lib/plans";

export async function checkoutAction(fd: FormData) {
  const user = await requireBusinessUser(["OWNER"]);
  if (!config.stripe.enabled) redirect("/dashboard/facturacion?estado=sin-stripe");
  const url = await createCheckoutSession(user.business, user.email, String(fd.get("plan")) as PlanId);
  redirect(url);
}

export async function portalAction() {
  const user = await requireBusinessUser(["OWNER"]);
  const url = await createPortalSession(user.business);
  redirect(url);
}
