import "server-only";
import { PKPass } from "passkit-generator";
import type { Business, CustomerCoupon, Customer, Location, LoyaltyCard, Media, Promotion } from "@prisma/client";
import { config, publicUrl } from "../config";
import { db } from "../db";
import { renderIcon, renderPassLogo, renderStampStrip, renderStrip } from "../images";
import { balanceSummary, stampRewardLine, stampRules } from "../loyalty";
import { formatDate, formatMoney } from "../format";

/**
 * Generación de pases .pkpass para Apple Wallet.
 *
 * Un solo Pass Type ID (de tu cuenta Apple Developer) sirve a todos los negocios de la plataforma;
 * cada pase muestra el nombre, colores y logo del negocio correspondiente.
 *
 * - Tarjeta de lealtad: estilo "storeCard".
 * - Cupón: estilo "coupon".
 * - "locations" (máx. 10) + "relevantText": Wallet sugiere el pase en la pantalla de bloqueo al estar cerca.
 * - "webServiceURL" + "authenticationToken": el iPhone se registra en /api/apple/v1/... y recibe
 *   actualizaciones por APNs. Los campos con "changeMessage" generan una notificación visible.
 */

export type BusinessWithMedia = Business & {
  logo: Media | null;
  strip: Media | null;
  stampIcon: Media | null;
  stampEmptyIcon: Media | null;
  locations: Location[];
};

/** Imágenes del diseño de sellos personalizado (null = diseño predeterminado). */
export function stampImages(b: BusinessWithMedia) {
  if (b.stampStyle !== "custom" || !b.stampIcon) return { stampImage: null, emptyImage: null };
  return {
    stampImage: Buffer.from(b.stampIcon.data),
    emptyImage: b.stampEmptyIcon ? Buffer.from(b.stampEmptyIcon.data) : null,
  };
}

function certificates() {
  const { apple } = config;
  if (!apple.enabled) throw new Error("Apple Wallet no está configurado (faltan certificados en variables de entorno)");
  return {
    wwdr: apple.wwdr()!,
    signerCert: apple.signerCert()!,
    signerKey: apple.signerKey()!,
    signerKeyPassphrase: apple.signerKeyPassphrase,
  };
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

async function baseAssets(business: BusinessWithMedia) {
  const logo = business.logo ? Buffer.from(business.logo.data) : null;
  const iconOpts = { logo, name: business.name, bg: business.bgColor, fg: business.fgColor };
  const files: Record<string, Buffer> = {
    "icon.png": await renderIcon(29, iconOpts),
    "icon@2x.png": await renderIcon(58, iconOpts),
    "icon@3x.png": await renderIcon(87, iconOpts),
  };
  if (logo) {
    files["logo.png"] = await renderPassLogo(1, logo);
    files["logo@2x.png"] = await renderPassLogo(2, logo);
    files["logo@3x.png"] = await renderPassLogo(3, logo);
  }
  return files;
}

/** Hasta 10 sucursales activas como ubicaciones relevantes del pase. */
export function passLocations(business: BusinessWithMedia) {
  return business.locations
    .filter((l) => l.active)
    .slice(0, 10)
    .map((l) => ({
      latitude: l.latitude,
      longitude: l.longitude,
      relevantText: (l.relevantText || `¡Estás cerca de ${business.name}! Muestra tu tarjeta y suma.`).slice(0, 120),
    }));
}

function commonProps(business: BusinessWithMedia, serialNumber: string, authToken: string, description: string) {
  return {
    formatVersion: 1 as const,
    passTypeIdentifier: config.apple.passTypeId!,
    teamIdentifier: config.apple.teamId!,
    serialNumber,
    authenticationToken: authToken,
    webServiceURL: publicUrl("/api/apple"),
    organizationName: business.name,
    description,
    logoText: business.logo ? undefined : business.name,
    backgroundColor: hexToRgb(business.bgColor),
    foregroundColor: hexToRgb(business.fgColor),
    labelColor: hexToRgb(business.labelColor),
    sharingProhibited: true,
  };
}

export async function buildLoyaltyPass(
  business: BusinessWithMedia,
  card: LoyaltyCard & { customer: Customer },
  activeCoupons: (CustomerCoupon & { promotion: Promotion })[] = [],
): Promise<Buffer> {
  const files = await baseAssets(business);
  const stripBg = business.strip ? Buffer.from(business.strip.data) : null;

  // Strip 375x123 pt (compatible con código QR cuadrado)
  for (const scale of [1, 2, 3]) {
    const name = scale === 1 ? "strip.png" : `strip@${scale}x.png`;
    const w = 375 * scale;
    const h = 123 * scale;
    files[name] =
      business.programType === "STAMPS"
        ? await renderStampStrip({
            width: w,
            height: h,
            stamps: card.stamps,
            required: business.stampsRequired,
            bg: business.bgColor,
            fg: business.fgColor,
            accent: business.labelColor,
            background: stripBg,
            ...stampImages(business),
          })
        : await renderStrip(w, h, { background: stripBg, bg: business.bgColor });
  }

  const pass = new PKPass(
    files,
    certificates(),
    commonProps(business, card.serial, card.authToken, `${business.programName} de ${business.name}`),
  );
  pass.type = "storeCard";

  const money = (c: number) => formatMoney(c, business.currency);
  const summary = balanceSummary(business, card, money);

  // En storeCard con strip, los primaryFields se dibujan sobre el strip; para sellos dejamos que la
  // imagen hable y mostramos el contador en el encabezado.
  pass.headerFields.push({
    key: "balance",
    label: summary.label,
    value: summary.value,
    changeMessage:
      business.programType === "CASHBACK"
        ? "Tu saldo ahora es %@"
        : business.programType === "POINTS"
          ? "Ahora tienes %@ puntos"
          : "Llevas %@ sellos",
  });

  if (business.programType !== "STAMPS") {
    pass.primaryFields.push({ key: "primary", label: summary.label, value: summary.value });
  }

  pass.secondaryFields.push({ key: "member", label: "Cliente", value: card.customer.name });
  if (business.programType === "STAMPS") {
    // Sin changeMessage: los avisos de nivel alcanzado / tarjeta completa van en "Novedades",
    // así canjear una recompensa no genera una notificación confusa.
    pass.secondaryFields.push({
      key: "rewards",
      label: "Recompensa",
      value: stampRewardLine(stampRules(business), card),
      textAlignment: "PKTextAlignmentRight",
    });
  } else {
    pass.secondaryFields.push({ key: "visits", label: "Visitas", value: String(card.visits) });
  }
  if (activeCoupons.length) {
    pass.auxiliaryFields.push({
      key: "coupons",
      label: "Cupones",
      value: `${activeCoupons.length} disponible${activeCoupons.length > 1 ? "s" : ""}`,
      changeMessage: "Tienes %@ cupones",
    });
  }

  // Campo de mensajes: al cambiar, iOS muestra el texto como notificación.
  pass.backFields.push({
    key: "news",
    label: "Novedades",
    value: card.lastMessage || `Gracias por ser parte de ${business.programName}.`,
    changeMessage: "%@",
  });
  for (const c of activeCoupons.slice(0, 5)) {
    pass.backFields.push({
      key: `coupon_${c.code}`,
      label: c.promotion.discountLabel || "Cupón",
      value: `${c.promotion.title}${c.expiresAt ? ` (vence ${formatDate(c.expiresAt)})` : ""}`,
    });
  }
  pass.backFields.push(
    { key: "card", label: "Ver mi tarjeta", value: publicUrl(`/tarjeta/${card.serial}`) },
    { key: "member_since", label: "Miembro desde", value: formatDate(card.createdAt) },
  );
  if (business.programType === "STAMPS") {
    pass.backFields.push({
      key: "rules",
      label: "Recompensas",
      value: stampRules(business)
        .map((r) => `${r.stamps} sellos: ${r.reward}${r.final ? "" : " (canjeable, descuenta los sellos)"}`)
        .join("\n"),
    });
  }
  if (business.programTerms) pass.backFields.push({ key: "terms", label: "Términos", value: business.programTerms });
  if (business.phone) pass.backFields.push({ key: "phone", label: "Teléfono", value: business.phone });
  if (business.website) pass.backFields.push({ key: "web", label: "Sitio web", value: business.website });

  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: card.serial,
    messageEncoding: "iso-8859-1",
    altText: card.serial,
  });

  // Sin ubicaciones mientras el aviso de cercanía está silenciado (el cliente ya visitó hoy)
  const muted = card.nearbyMutedUntil && card.nearbyMutedUntil > new Date();
  const locations = muted ? [] : passLocations(business);
  if (locations.length) pass.setLocations(...locations);

  return pass.getAsBuffer();
}

export async function buildCouponPass(
  business: BusinessWithMedia,
  coupon: CustomerCoupon & { promotion: Promotion & { image: Media | null }; customer: Customer },
): Promise<Buffer> {
  const files = await baseAssets(business);
  const promoImg = coupon.promotion.image ? Buffer.from(coupon.promotion.image.data) : null;
  const stripBg = promoImg ?? (business.strip ? Buffer.from(business.strip.data) : null);
  for (const scale of [1, 2, 3]) {
    files[scale === 1 ? "strip.png" : `strip@${scale}x.png`] = await renderStrip(375 * scale, 123 * scale, {
      background: stripBg,
      bg: business.bgColor,
    });
  }

  const p = coupon.promotion;
  const pass = new PKPass(files, certificates(), {
    ...commonProps(business, coupon.code, coupon.authToken, `Cupón de ${business.name}: ${p.title}`),
    voided: coupon.status !== "ACTIVE",
  });
  pass.type = "coupon";

  pass.primaryFields.push({ key: "offer", label: p.title, value: p.discountLabel || "Cupón" });
  pass.secondaryFields.push({ key: "for", label: "Para", value: coupon.customer.name });
  if (coupon.expiresAt) {
    pass.secondaryFields.push({ key: "expires", label: "Vence", value: formatDate(coupon.expiresAt) });
    pass.setExpirationDate(coupon.expiresAt);
  }
  pass.auxiliaryFields.push({
    key: "status",
    label: "Estado",
    value:
      coupon.status === "ACTIVE"
        ? "Disponible"
        : coupon.status === "REDEEMED"
          ? "Canjeado"
          : coupon.status === "VOID"
            ? "Revocado"
            : "Vencido",
    changeMessage: "Tu cupón: %@",
  });
  if (p.description) pass.backFields.push({ key: "desc", label: "Descripción", value: p.description });
  if (p.terms) pass.backFields.push({ key: "terms", label: "Términos y condiciones", value: p.terms });
  pass.backFields.push({ key: "link", label: "Ver cupón", value: publicUrl(`/cupon/${coupon.code}`) });

  pass.setBarcodes({ format: "PKBarcodeFormatQR", message: coupon.code, messageEncoding: "iso-8859-1", altText: coupon.code });
  const card = await db.loyaltyCard.findUnique({ where: { customerId: coupon.customerId }, select: { nearbyMutedUntil: true } });
  const muted = card?.nearbyMutedUntil && card.nearbyMutedUntil > new Date();
  const locations = (muted ? [] : passLocations(business)).map((l) => ({
    ...l,
    relevantText: `Usa tu cupón "${p.title}" en ${business.name}`.slice(0, 120),
  }));
  if (locations.length) pass.setLocations(...locations);

  return pass.getAsBuffer();
}
