import "server-only";
import sharp from "sharp";
import { stampGrid } from "./loyalty";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Normaliza una imagen subida: la convierte a PNG y limita su tamaño. */
export async function normalizeUpload(input: Buffer, maxSide = 1200) {
  const img = sharp(input, { failOn: "error" }).rotate();
  const out = await img
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height, mime: "image/png" };
}

/** Ícono cuadrado: usa el logo si existe; si no, la inicial del negocio sobre su color. */
export async function renderIcon(size: number, opts: { logo?: Buffer | null; name: string; bg: string; fg: string }) {
  if (opts.logo) {
    return sharp(opts.logo)
      .resize(size, size, { fit: "contain", background: opts.bg })
      .flatten({ background: opts.bg })
      .png()
      .toBuffer();
  }
  const initial = esc((opts.name.trim()[0] ?? "?").toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" rx="${size * 0.2}" fill="${esc(opts.bg)}"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
      font-weight="700" font-size="${size * 0.55}" fill="${esc(opts.fg)}">${initial}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Logo para la cabecera del pase de Apple (máx. 160x50 pt, con transparencia). */
export async function renderPassLogo(scale: number, logo: Buffer) {
  return sharp(logo)
    .resize(160 * scale, 50 * scale, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, position: "left" })
    .png()
    .toBuffer();
}

/** Silueta semitransparente del sello en el color del texto (sello vacío por defecto en el diseño personalizado). */
async function fadeImage(img: Buffer, size: number, color: string) {
  const icon = await sharp(img).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
  const tint = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${esc(color)}" fill-opacity="0.35"/></svg>`,
  );
  return sharp(tint).composite([{ input: icon, blend: "dest-in" }]).png().toBuffer();
}

/**
 * Imagen "strip" con los sellos de la tarjeta.
 * - Diseño predeterminado: círculos llenos/vacíos con palomita.
 * - Diseño personalizado: la imagen del sello para los espacios ganados y, para los vacíos,
 *   la imagen de "sello vacío" (o el mismo sello en gris y semitransparente).
 * Se usa como strip en Apple Wallet y como heroImage en Google Wallet, y se regenera con cada sello.
 */
export async function renderStampStrip(opts: {
  width: number;
  height: number;
  stamps: number;
  required: number;
  bg: string;
  fg: string;
  accent: string;
  background?: Buffer | null;
  stampImage?: Buffer | null;
  emptyImage?: Buffer | null;
}) {
  const { width, height, stamps, required, bg, fg, accent } = opts;
  const { n, rows, perRow } = stampGrid(required);
  // Celdas cuadradas, centradas en la franja (mismo acomodo que la tarjeta web)
  const padX = width * 0.06;
  const padY = height * 0.06;
  const cell = Math.min((width - padX * 2) / perRow, (height - padY * 2) / rows);
  const x0 = (width - cell * perRow) / 2;
  const y0 = (height - cell * rows) / 2;
  const r = cell * 0.36;
  const custom = Boolean(opts.stampImage);

  let circles = "";
  const icons: { input: Buffer; left: number; top: number }[] = [];
  const iconSize = Math.max(8, Math.round(r * 2.3));
  const filledIcon = custom
    ? await sharp(opts.stampImage!).resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    : null;
  const emptyIcon = custom
    ? opts.emptyImage
      ? await sharp(opts.emptyImage).resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
      : await fadeImage(opts.stampImage!, iconSize, fg)
    : null;

  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const cx = x0 + cell * col + cell / 2;
    const cy = y0 + cell * row + cell / 2;
    const filled = i < stamps;
    if (custom) {
      icons.push({
        input: filled ? filledIcon! : emptyIcon!,
        left: Math.round(cx - iconSize / 2),
        top: Math.round(cy - iconSize / 2),
      });
      continue;
    }
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${filled ? esc(accent) : "none"}" stroke="${esc(
      filled ? accent : fg,
    )}" stroke-opacity="${filled ? 1 : 0.55}" stroke-width="${Math.max(2, r * 0.12)}"/>`;
    if (filled) {
      const s = r * 0.5;
      circles += `<path d="M ${cx - s} ${cy} L ${cx - s * 0.25} ${cy + s * 0.7} L ${cx + s} ${cy - s * 0.6}" fill="none"
        stroke="${esc(bg)}" stroke-width="${Math.max(2, r * 0.18)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${esc(bg)}" fill-opacity="${opts.background ? 0.55 : 1}"/>${circles}</svg>`;
  const layers = [{ input: Buffer.from(svg), left: 0, top: 0 }, ...icons];
  const base = opts.background
    ? sharp(opts.background).resize(width, height, { fit: "cover" })
    : sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite(layers).png().toBuffer();
}

/** Strip/hero genérico (programas de puntos o monedero): imagen subida o banda de color. */
export async function renderStrip(width: number, height: number, opts: { background?: Buffer | null; bg: string }) {
  if (opts.background) return sharp(opts.background).resize(width, height, { fit: "cover" }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: opts.bg } }).png().toBuffer();
}
