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

/** Convierte "123.45" o "123,45" a centavos. */
export function parseMoneyToCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  const n = typeof input === "number" ? input : Number(String(input).replace(/[^0-9.,-]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
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
