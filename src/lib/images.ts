import "server-only";
import sharp from "sharp";

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

/**
 * Imagen "strip" con los sellos de la tarjeta: círculos llenos/vacíos.
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
}) {
  const { width, height, stamps, required, bg, fg, accent } = opts;
  const n = Math.max(1, Math.min(required, 20));
  const rows = n > 10 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const padX = width * 0.06;
  const cellW = (width - padX * 2) / perRow;
  const cellH = height / rows;
  const r = Math.min(cellW, cellH) * 0.36;
  let circles = "";
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const cx = padX + cellW * col + cellW / 2;
    const cy = cellH * row + cellH / 2;
    const filled = i < stamps;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${filled ? esc(accent) : "none"}" stroke="${esc(
      filled ? accent : fg,
    )}" stroke-opacity="${filled ? 1 : 0.55}" stroke-width="${Math.max(2, r * 0.12)}"/>`;
    if (filled) {
      // palomita
      const s = r * 0.5;
      circles += `<path d="M ${cx - s} ${cy} L ${cx - s * 0.25} ${cy + s * 0.7} L ${cx + s} ${cy - s * 0.6}" fill="none"
        stroke="${esc(bg)}" stroke-width="${Math.max(2, r * 0.18)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${esc(bg)}" fill-opacity="${opts.background ? 0.55 : 1}"/>${circles}</svg>`;
  const overlay = Buffer.from(svg);
  if (opts.background) {
    return sharp(opts.background)
      .resize(width, height, { fit: "cover" })
      .composite([{ input: overlay }])
      .png()
      .toBuffer();
  }
  return sharp(overlay).png().toBuffer();
}

/** Strip/hero genérico (programas de puntos o monedero): imagen subida o banda de color. */
export async function renderStrip(width: number, height: number, opts: { background?: Buffer | null; bg: string }) {
  if (opts.background) return sharp(opts.background).resize(width, height, { fit: "cover" }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: opts.bg } }).png().toBuffer();
}
