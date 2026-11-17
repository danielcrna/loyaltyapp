"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import type { SubscriptionStatus } from "@prisma/client";

const STATUSES: SubscriptionStatus[] = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "INCOMPLETE"];

export async function updateBusinessAdminAction(fd: FormData) {
  await requireSuperAdmin();
  const id = String(fd.get("id"));
  const plan = String(fd.get("plan"));
  const status = String(fd.get("status")) as SubscriptionStatus;
  const extend = Number(fd.get("extendTrial") || 0);
  await db.business.update({
    where: { id },
    data: {
      ...(PLANS.some((p) => p.id === plan) ? { plan } : {}),
      ...(STATUSES.includes(status) ? { subscriptionStatus: status } : {}),
      ...(extend > 0 ? { trialEndsAt: new Date(Date.now() + extend * 864e5), subscriptionStatus: "TRIALING" } : {}),
    },
  });
  revalidatePath("/admin");
}
