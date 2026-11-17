import "server-only";
import { GoogleAuth } from "google-auth-library";
import { SignJWT, importPKCS8 } from "jose";
import type { Business, Customer, CustomerCoupon, LoyaltyCard, Promotion } from "@prisma/client";
import { config, publicUrl } from "../config";
import { balanceSummary, rulesSummary, stampRewardLine, stampRules } from "../loyalty";
import { formatDate, formatMoney } from "../format";
import type { BusinessWithMedia } from "./apple";

/**
 * Integración con Google Wallet API (gratuita).
 * - Una LoyaltyClass por negocio (diseño, logo, sucursales con merchantLocations para avisos por cercanía).
 * - Un LoyaltyObject por cliente (saldo, QR).
 * - Una OfferClass por promoción y un OfferObject por cupón.
 * - Botón "Agregar a Google Wallet": enlace https://pay.google.com/gp/v/save/<JWT firmado>.
 * - Notificaciones: addMessage con messageType TEXT_AND_NOTIFY (máx. 3 por pase cada 24 h, límite de Google).
 */

const API = "https://walletobjects.googleapis.com/walletobjects/v1";

let auth: GoogleAuth | null = null;
function client() {
  if (!auth) {
    auth = new GoogleAuth({
      credentials: { client_email: config.google.serviceAccountEmail, private_key: config.google.privateKey() },
      scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
    });
  }
  return auth;
}

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const c = await client().getClient();
  try {
    const res = await c.request<T>({ url: `${API}${path}`, method: method as "GET", data: body });
    return { status: res.status, data: res.data };
  } catch (e: unknown) {
    const err = e as { response?: { status: number; data: T } };
    if (err.response) return { status: err.response.status, data: err.response.data };
    throw e;
  }
}

const safeId = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");
export const loyaltyClassId = (b: Pick<Business, "id">) => `${config.google.issuerId}.loyalty_${safeId(b.id)}`;
export const loyaltyObjectId = (c: Pick<LoyaltyCard, "serial">) => `${config.google.issuerId}.card_${c.serial}`;
export const offerClassId = (p: Pick<Promotion, "id">) => `${config.google.issuerId}.promo_${safeId(p.id)}`;
export const offerObjectId = (c: Pick<CustomerCoupon, "code">) => `${config.google.issuerId}.coupon_${c.code}`;

const img = (uri: string, description: string) => ({
  sourceUri: { uri },
  contentDescription: { defaultValue: { language: "es-MX", value: description } },
});
const text = (value: string) => ({ defaultValue: { language: "es-MX", value } });

// ─────────────────────────── Clases ───────────────────────────

export function buildLoyaltyClass(business: BusinessWithMedia) {
  const v = business.googleClassVersion;
  return {
    id: loyaltyClassId(business),
    issuerName: business.name.slice(0, 40),
    programName: business.programName.slice(0, 40),
    programLogo: img(publicUrl(`/api/img/logo/${business.id}?v=${v}`), business.name),
    hexBackgroundColor: business.bgColor,
    countryCode: "MX",
    reviewStatus: "UNDER_REVIEW",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
    ...(business.programType !== "STAMPS" && business.strip
      ? { heroImage: img(publicUrl(`/api/media/${business.strip.id}`), business.name) }
      : {}),
    // Avisos por cercanía: Google controla el radio y el texto de la notificación (máx. 10 ubicaciones).
    merchantLocations: business.locations
      .filter((l) => l.active)
      .slice(0, 10)
      .map((l) => ({ latitude: l.latitude, longitude: l.longitude })),
    ...(business.website
      ? { homepageUri: { uri: business.website, description: "Sitio web" } }
      : {}),
    ...(business.programTerms
      ? { textModulesData: [{ id: "terms", header: "Términos", body: business.programTerms.slice(0, 1000) }] }
      : {}),
  };
}

export function buildOfferClass(business: BusinessWithMedia, promo: Promotion) {
  return {
    id: offerClassId(promo),
    issuerName: business.name.slice(0, 40),
    provider: business.name.slice(0, 40),
    title: promo.title.slice(0, 60),
    redemptionChannel: "INSTORE",
    reviewStatus: "UNDER_REVIEW",
    titleImage: img(publicUrl(`/api/img/logo/${business.id}?v=${business.googleClassVersion}`), business.name),
    hexBackgroundColor: business.bgColor,
    ...(promo.imageId ? { heroImage: img(publicUrl(`/api/media/${promo.imageId}`), promo.title) } : {}),
    ...(promo.description ? { details: promo.description.slice(0, 1000) } : {}),
    ...(promo.terms ? { finePrint: promo.terms.slice(0, 1000) } : {}),
    shortTitle: (promo.discountLabel || promo.title).slice(0, 20),
    merchantLocations: business.locations
      .filter((l) => l.active)
      .slice(0, 10)
      .map((l) => ({ latitude: l.latitude, longitude: l.longitude })),
  };
}

// ─────────────────────────── Objetos ───────────────────────────

export function buildLoyaltyObject(
  business: BusinessWithMedia,
  card: LoyaltyCard & { customer: Customer },
  activeCoupons: (CustomerCoupon & { promotion: Promotion })[] = [],
) {
  const money = (c: number) => formatMoney(c, business.currency);
  const summary = balanceSummary(business, card, money);
  const balance =
    business.programType === "CASHBACK"
      ? { money: { micros: String(card.cashbackCents * 10000), currencyCode: business.currency } }
      : business.programType === "POINTS"
        ? { int: card.points }
        : { string: summary.value };

  const textModules = [];
  if (card.lastMessage) textModules.push({ id: "news", header: "Novedades", body: card.lastMessage });
  if (business.programType === "STAMPS") {
    const rules = stampRules(business);
    textModules.push({
      id: "rewards",
      header: `Recompensa: ${stampRewardLine(rules, card)}`.slice(0, 60),
      body: rulesSummary(rules),
    });
  }
  for (const c of activeCoupons.slice(0, 5)) {
    textModules.push({
      id: `coupon_${c.code}`,
      header: c.promotion.discountLabel || "Cupón",
      body: `${c.promotion.title}${c.expiresAt ? ` (vence ${formatDate(c.expiresAt)})` : ""}`,
    });
  }

  return {
    id: loyaltyObjectId(card),
    classId: loyaltyClassId(business),
    state: "ACTIVE",
    accountId: card.serial,
    accountName: card.customer.name,
    loyaltyPoints: { label: summary.label, balance },
    ...(business.programType === "STAMPS"
      ? {
          secondaryLoyaltyPoints: { label: "Recompensas", balance: { int: card.rewardsAvailable } },
          heroImage: img(
            publicUrl(
              `/api/img/stamps/${card.serial}?s=${card.stamps}&r=${business.stampsRequired}&v=${business.googleClassVersion}`,
            ),
            `${card.stamps} de ${business.stampsRequired} sellos`,
          ),
        }
      : { secondaryLoyaltyPoints: { label: "Visitas", balance: { int: card.visits } } }),
    barcode: { type: "QR_CODE", value: card.serial, alternateText: card.serial },
    textModulesData: textModules,
    linksModuleData: {
      uris: [{ id: "card", uri: publicUrl(`/tarjeta/${card.serial}`), description: "Ver mi tarjeta" }],
    },
  };
}

export function buildOfferObject(promo: Promotion, coupon: CustomerCoupon) {
  return {
    id: offerObjectId(coupon),
    classId: offerClassId(promo),
    state:
      coupon.status === "ACTIVE"
        ? "ACTIVE"
        : coupon.status === "EXPIRED"
          ? "EXPIRED"
          : coupon.status === "VOID"
            ? "INACTIVE"
            : "COMPLETED",
    barcode: { type: "QR_CODE", value: coupon.code, alternateText: coupon.code },
    ...(coupon.expiresAt ? { validTimeInterval: { end: { date: coupon.expiresAt.toISOString() } } } : {}),
    linksModuleData: { uris: [{ id: "coupon", uri: publicUrl(`/cupon/${coupon.code}`), description: "Ver cupón" }] },
  };
}

// ─────────────────────────── Operaciones ───────────────────────────

/** Crea o actualiza una clase (loyaltyClass / offerClass). */
async function upsertClass(resource: "loyaltyClass" | "offerClass", cls: { id: string }) {
  const r = await api("PUT", `/${resource}/${encodeURIComponent(cls.id)}`, cls);
  if (r.status === 404) {
    const ins = await api("POST", `/${resource}`, cls);
    if (ins.status >= 300) throw new Error(`Google Wallet ${resource} insert ${ins.status}: ${JSON.stringify(ins.data)}`);
  } else if (r.status >= 300) {
    throw new Error(`Google Wallet ${resource} update ${r.status}: ${JSON.stringify(r.data)}`);
  }
}

export const upsertLoyaltyClass = (b: BusinessWithMedia) => upsertClass("loyaltyClass", buildLoyaltyClass(b));
export const upsertOfferClass = (b: BusinessWithMedia, p: Promotion) => upsertClass("offerClass", buildOfferClass(b, p));

/**
 * Actualiza un objeto si ya existe (el cliente lo guardó). Si notify=true, Google notifica el cambio de saldo
 * (solo para loyaltyPoints.balance; sujeto al límite de 3 notificaciones por día).
 */
export async function patchObject(
  resource: "loyaltyObject" | "offerObject",
  obj: { id: string },
  notify = false,
): Promise<boolean> {
  const body = notify ? { ...obj, notifyPreference: "NOTIFY_ON_UPDATE" } : obj;
  const r = await api("PUT", `/${resource}/${encodeURIComponent(obj.id)}`, body);
  if (r.status === 404) return false;
  if (r.status >= 300) throw new Error(`Google Wallet ${resource} update ${r.status}: ${JSON.stringify(r.data)}`);
  return true;
}

/** Mensaje con notificación a un pase concreto. */
export async function addObjectMessage(
  resource: "loyaltyObject" | "offerObject",
  objectId: string,
  header: string,
  body: string,
) {
  const r = await api("POST", `/${resource}/${encodeURIComponent(objectId)}/addMessage`, {
    message: {
      id: `msg_${Date.now()}`,
      header: header.slice(0, 60),
      body: body.slice(0, 500),
      messageType: "TEXT_AND_NOTIFY",
    },
  });
  return r.status < 300;
}

/** Mensaje a TODOS los titulares de la clase (difusión). */
export async function addClassMessage(classId: string, header: string, body: string) {
  const r = await api("POST", `/loyaltyClass/${encodeURIComponent(classId)}/addMessage`, {
    message: {
      id: `msg_${Date.now()}`,
      header: header.slice(0, 60),
      body: body.slice(0, 500),
      messageType: "TEXT_AND_NOTIFY",
    },
  });
  if (r.status >= 300) throw new Error(`Google Wallet addMessage ${r.status}: ${JSON.stringify(r.data)}`);
  return true;
}

/** Firma el JWT "Save to Google Wallet". Incluye el objeto completo: Google lo crea si no existe. */
export async function saveUrl(payload: {
  loyaltyClasses?: unknown[];
  loyaltyObjects?: unknown[];
  offerClasses?: unknown[];
  offerObjects?: unknown[];
}): Promise<string> {
  const key = await importPKCS8(config.google.privateKey()!, "RS256");
  const origin = new URL(config.appUrl).origin;
  const token = await new SignJWT({
    iss: config.google.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    origins: [origin],
    payload,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt()
    .sign(key);
  return `https://pay.google.com/gp/v/save/${token}`;
}
