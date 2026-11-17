import type { Business } from "@prisma/client";
import { config } from "./config";
import { getPlan } from "./plans";

/** ¿El negocio tiene acceso al servicio (prueba vigente o suscripción activa)? */
export function hasActiveAccess(b: Pick<Business, "subscriptionStatus" | "trialEndsAt" | "currentPeriodEnd">) {
  if (!config.stripe.enabled) return true; // sin Stripe configurado (desarrollo) todo queda activo
  switch (b.subscriptionStatus) {
    case "ACTIVE":
      return true;
    case "TRIALING":
      return !b.trialEndsAt || b.trialEndsAt.getTime() > Date.now();
    case "PAST_DUE":
      // periodo de gracia de 7 días
      return !b.currentPeriodEnd || b.currentPeriodEnd.getTime() + 7 * 864e5 > Date.now();
    default:
      return false;
  }
}

export function trialDaysLeft(b: Pick<Business, "trialEndsAt">) {
  if (!b.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((b.trialEndsAt.getTime() - Date.now()) / 864e5));
}

export function planLimits(b: Pick<Business, "plan">) {
  return getPlan(b.plan);
}

export const STATUS_LABELS: Record<Business["subscriptionStatus"], string> = {
  TRIALING: "Periodo de prueba",
  ACTIVE: "Activa",
  PAST_DUE: "Pago pendiente",
  CANCELED: "Cancelada",
  INCOMPLETE: "Incompleta",
};
