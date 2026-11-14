import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { APP_NAME, APP_TAGLINE } from "../src/web/app.brand";
import { HERO } from "../src/web/landing/landing.copy";

/**
 * Regenerasi ikon PNG/ICO + og-image dari src/web/public/favicon.svg (sumber tunggal logo) lewat Chromium Playwright
 * yang sudah terpasang (tanpa dependency baru). Hasil di-commit; jalankan ulang hanya bila logo/teks berubah:
 * `bun scripts/build.icons.ts` (sekali: `bunx --bun playwright install chromium`).
 */
const PUBLIC_DIR = join(import.meta.dir, "../src/web/public");
const svg = readFileSync(join(PUBLIC_DIR, "favicon.svg"), "utf8");
/** Varian tanpa sudut membulat: iOS memotong sudut apple-touch-icon sendiri, sudut transparan jadi hitam. */
const squareSvg = svg.replace(/ rx="14"/, "");
/** Latar gelap app (--background dark, oklch(0.145 0 0)). */
const DARK_BG = "#0a0a0a";

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(html: string, width: number, height: number): Promise<Buffer> {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
  return page.screenshot({ omitBackground: true, type: "png" });
}
const icon = (source: string, size: number) => render(source.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `), size, size);

/** ICO berisi satu PNG (didukung semua browser modern): header 6 byte + 1 entri direktori 16 byte + data PNG. */
function pngToIco(png: Buffer, size: number): Buffer {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2); // tipe 1 = icon
  head.writeUInt16LE(1, 4); // jumlah gambar
  head.writeUInt8(size, 6);
  head.writeUInt8(size, 7);
  head.writeUInt16LE(1, 10); // color planes
  head.writeUInt16LE(32, 12); // bit per pixel
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18); // offset data
  return Buffer.concat([head, png]);
}

try {
  writeFileSync(join(PUBLIC_DIR, "favicon.ico"), pngToIco(await icon(svg, 32), 32));
  writeFileSync(join(PUBLIC_DIR, "apple-touch-icon.png"), await icon(squareSvg, 180));
  writeFileSync(join(PUBLIC_DIR, "icon-192.png"), await icon(svg, 192));
  writeFileSync(join(PUBLIC_DIR, "icon-512.png"), await icon(svg, 512));
  const og = `
    <div style="box-sizing:border-box;width:1200px;height:630px;padding:96px;display:flex;flex-direction:column;justify-content:center;gap:40px;
      background:radial-gradient(circle at 85% 15%, #1c69e355, transparent 55%), ${DARK_BG};color:#fafafa;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
      <div style="display:flex;align-items:center;gap:32px">
        ${svg.replace("<svg ", '<svg width="128" height="128" ')}
        <span style="font-size:96px;font-weight:700;letter-spacing:-0.03em">${APP_NAME}</span>
      </div>
      <div style="font-size:52px;font-weight:600;line-height:1.15;max-width:960px">${APP_TAGLINE}</div>
      <div style="font-size:30px;color:#a1a1a1">${HERO.points.join(" · ")}</div>
    </div>`;
  writeFileSync(join(PUBLIC_DIR, "og-image.png"), await render(og, 1200, 630));
} finally {
  await browser.close();
}
console.log(`build.icons: ikon + og-image ditulis ke ${PUBLIC_DIR}`);
