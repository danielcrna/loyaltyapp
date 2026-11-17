// Genera los íconos de la PWA en public/icons. Uso: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("public/icons", { recursive: true });

function svg(size, maskable) {
  const radius = maskable ? 0 : size * 0.22;
  const font = size * (maskable ? 0.42 : 0.6);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="100%" height="100%" rx="${radius}" fill="#ea580c"/>` +
      `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial" font-weight="700" font-size="${font}" fill="#fff">★</text>` +
      `</svg>`,
  );
}

await sharp(svg(192, false)).png().toFile("public/icons/icon-192.png");
await sharp(svg(512, false)).png().toFile("public/icons/icon-512.png");
await sharp(svg(512, true)).png().toFile("public/icons/icon-maskable-512.png");
console.log("Íconos generados en public/icons");
