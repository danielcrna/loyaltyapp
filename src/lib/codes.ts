import { randomBytes } from "node:crypto";

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para captura manual.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Serial de tarjeta de lealtad: prefijo C + 14 caracteres (~69 bits). */
export const newCardSerial = () => `C${randomCode(14)}`;
/** Código de cupón: prefijo P + 12 caracteres. */
export const newCouponCode = () => `P${randomCode(12)}`;
/** Token de autenticación para el web service de Apple Wallet (mín. 16 caracteres). */
export const newAuthToken = () => randomBytes(24).toString("hex");

export type ScannedCode = { kind: "card" | "coupon"; value: string } | null;

/** Interpreta el contenido de un QR escaneado o un código capturado a mano. */
export function parseScannedCode(input: string): ScannedCode {
  let value = input.trim();
  // El QR puede contener una URL (p. ej. /tarjeta/CXXXX); nos quedamos con el último segmento.
  const m = value.match(/\/(tarjeta|cupon)\/([A-Za-z0-9]+)\/?$/);
  if (m) value = m[2];
  value = value.toUpperCase().replace(/[\s-]/g, "");
  if (/^C[2-9A-HJ-NP-Z]{14}$/.test(value)) return { kind: "card", value };
  if (/^P[2-9A-HJ-NP-Z]{12}$/.test(value)) return { kind: "coupon", value };
  return null;
}
