/**
 * Generate brand SVG + PNG assets using satori + Inter Bold.
 *
 * Renders the lettermark ("CV") and wordmark ("CompositeVoice") via satori,
 * extracts the typographic paths, and assembles clean adaptive SVGs with
 * CSS color-scheme support. Also generates PNG raster icons via sharp for
 * favicons, apple-touch-icon, and PWA manifest.
 *
 * Outputs (SVG — in packages/ui/src/):
 *  - brand-lettermark.svg  — bare adaptive lettermark
 *  - brand-icon.svg        — iconmark with rounded background
 *  - brand-wordmark.svg    — full "CompositeVoice" wordmark
 *
 * Outputs (PNG — in each app's public/):
 *  - favicon-32x32.png     — small raster favicon
 *  - apple-touch-icon.png  — 180×180 for iOS
 *  - icon-192x192.png      — PWA manifest
 *  - icon-512x512.png      — PWA manifest (large)
 *
 * Outputs (PNG — in packages/ui/src/):
 *  - brand-wordmark-light.png — white+teal wordmark for OG images
 *
 * Usage: node scripts/generate-lettermark.mjs
 */

import satori from "satori";
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/* ── Brand tokens ─────────────────────────────── */

const ACCENT = "#41cbbf";
const BASE_LIGHT = "#1a1a1a";
const BASE_DARK = "#ffffff";
const BG_LIGHT = "#ffffff";
const BG_DARK = "#1a1a1a";

/* ── Font ─────────────────────────────────────── */

const interBold = readFileSync(
  join(root, "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff")
);

const fonts = [{ name: "Inter", data: interBold, weight: 700, style: "normal" }];

/* ── Helpers ──────────────────────────────────── */

async function render(baseText, accentText, width, height, fontSize, letterSpacing) {
  return satori(
    {
      type: "div",
      props: {
        children: [
          {
            type: "span",
            props: { children: baseText, style: { color: BASE_LIGHT } },
          },
          {
            type: "span",
            props: { children: accentText, style: { color: ACCENT } },
          },
        ],
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter",
          fontWeight: 700,
          fontSize,
          lineHeight: 1,
          letterSpacing: letterSpacing || "-0.02em",
          width: "100%",
          height: "100%",
        },
      },
    },
    { width, height, fonts }
  );
}

function extractPaths(rawSvg) {
  const regex = /fill="([^"]+)"[^>]*?\bd="([^"]+)"/g;
  const base = [];
  const accent = [];
  let m;
  while ((m = regex.exec(rawSvg)) !== null) {
    if (m[1] === ACCENT) accent.push(m[2]);
    else if (m[1] === BASE_LIGHT) base.push(m[2]);
  }
  return { base, accent };
}

function buildAdaptiveSvg(width, height, { base, accent }, { background } = {}) {
  const bgRule = background ? `\n    .bg { fill: ${BG_LIGHT}; }` : "";
  const bgDarkRule = background ? `\n      .bg { fill: ${BG_DARK}; }` : "";
  const bgRect = background
    ? `\n  <rect class="bg" width="${width}" height="${height}" rx="${background.rx}"/>`
    : "";
  const basePaths = base.map((d) => `\n  <path class="base" d="${d}"/>`).join("");
  const accentPaths = accent.map((d) => `\n  <path class="accent" d="${d}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <style>${bgRule}
    .base { fill: ${BASE_LIGHT}; }
    .accent { fill: ${ACCENT}; }
    @media (prefers-color-scheme: dark) {${bgDarkRule}
      .base { fill: ${BASE_DARK}; }
    }
  </style>${bgRect}${basePaths}${accentPaths}
</svg>
`;
}

function buildStaticSvg(width, height, { base, accent }, { bg, baseFill, rx } = {}) {
  const bgRect = bg
    ? `<rect fill="${bg}" width="${width}" height="${height}" rx="${rx || 0}"/>`
    : "";
  const basePaths = base.map((d) => `<path fill="${baseFill}" d="${d}"/>`).join("");
  const accentPaths = accent.map((d) => `<path fill="${ACCENT}" d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${bgRect}${basePaths}${accentPaths}</svg>`;
}

async function svgToPng(svgStr, size) {
  return sharp(Buffer.from(svgStr)).resize(size, size).png().toBuffer();
}

async function svgToPngRect(svgStr, width, height) {
  return sharp(Buffer.from(svgStr)).resize(width, height).png().toBuffer();
}

function write(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  console.log(`  ✓ ${filePath.replace(root + "/", "")}`);
}

/* ── 1. Render via satori ─────────────────────── */

console.log("Rendering lettermark…");
const lettermarkRaw = await render("C", "V", 128, 128, 80, "-0.02em");
const lettermarkPaths = extractPaths(lettermarkRaw);
console.log(`  ${lettermarkPaths.base.length} base + ${lettermarkPaths.accent.length} accent`);

console.log("Rendering wordmark…");
const wordmarkRaw = await render("Composite", "Voice", 640, 96, 64, "-0.03em");
const wordmarkPaths = extractPaths(wordmarkRaw);
console.log(`  ${wordmarkPaths.base.length} base + ${wordmarkPaths.accent.length} accent`);

/* ── 2. Build adaptive SVGs ───────────────────── */

const lettermarkSvg = buildAdaptiveSvg(128, 128, lettermarkPaths);
const iconSvg = buildAdaptiveSvg(128, 128, lettermarkPaths, { background: { rx: 28 } });
const wordmarkSvg = buildAdaptiveSvg(640, 96, wordmarkPaths);

/* ── 3. Build static SVGs for PNG conversion ──── */

// Icon: white bg + dark text (for light-mode icons / apple-touch-icon)
const iconStaticSvg = buildStaticSvg(128, 128, lettermarkPaths, {
  bg: BG_LIGHT,
  baseFill: BASE_LIGHT,
  rx: 28,
});

// Wordmark: white text on transparent (for OG images with dark bg)
const wordmarkLightSvg = buildStaticSvg(640, 96, wordmarkPaths, {
  baseFill: BASE_DARK,
});

/* ── 4. Generate PNGs ─────────────────────────── */

console.log("\nGenerating PNGs…");

const iconPngs = {
  "favicon-32x32.png": await svgToPng(iconStaticSvg, 32),
  "apple-touch-icon.png": await svgToPng(iconStaticSvg, 180),
  "icon-192x192.png": await svgToPng(iconStaticSvg, 192),
  "icon-512x512.png": await svgToPng(iconStaticSvg, 512),
};

const wordmarkLightPng = await svgToPngRect(wordmarkLightSvg, 640, 96);

/* ── 5. Write everything ──────────────────────── */

console.log("\nWriting SVGs:");
write(join(root, "packages/ui/src/brand-lettermark.svg"), lettermarkSvg);
write(join(root, "packages/ui/src/brand-icon.svg"), iconSvg);
write(join(root, "packages/ui/src/brand-wordmark.svg"), wordmarkSvg);

for (const app of ["docs", "design", "web"]) {
  write(join(root, `apps/${app}/public/favicon.svg`), iconSvg);
}

console.log("\nWriting PNGs:");
for (const app of ["docs", "design", "web"]) {
  for (const [name, buf] of Object.entries(iconPngs)) {
    write(join(root, `apps/${app}/public/${name}`), buf);
  }
}

// Wordmark PNG for OG images (shared asset)
write(join(root, "packages/ui/src/brand-wordmark-light.png"), wordmarkLightPng);

// Also copy to each app's src/assets for astro-og-canvas access
for (const app of ["docs", "design", "web"]) {
  write(join(root, `apps/${app}/src/assets/brand-wordmark-light.png`), wordmarkLightPng);
}

/* ── 6. Clean up legacy files ─────────────────── */

for (const old of ["brand-lettermark-light.svg"]) {
  const p = join(root, "packages/ui/src", old);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`  ✗ Removed: packages/ui/src/${old}`);
  }
}

console.log("\nDone.");
