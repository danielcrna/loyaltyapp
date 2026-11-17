export function formatMoney(cents: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(cents / 100);
}

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City", ...opts }).format(
    new Date(d),
  );
}

export function formatDateTime(d: Date | string | null | undefined) {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Convierte un monto capturado a centavos.
 * Acepta el formato de México ("1,500.50", "$1,500", "1500") y la coma decimal ("150,50").
 * Una coma seguida de exactamente tres dígitos es separador de miles: "1,500" son mil quinientos.
 * Devuelve 0 si el texto no es un monto reconocible.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : 0;
  let s = String(input).replace(/[^0-9.,-]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Con ambos separadores, el que aparece al final es el decimal.
    s = lastDot > lastComma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    const [head, ...rest] = s.split(",");
    const thousands = rest.every((g) => g.length === 3) && /[1-9]/.test(head);
    if (thousands) s = head + rest.join("");
    else if (rest.length === 1) s = `${head}.${rest[0]}`;
    else return 0;
  } else if (lastDot >= 0 && s.indexOf(".") !== lastDot) {
    // Varios puntos ("1.500.000") solo pueden ser separadores de miles.
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
