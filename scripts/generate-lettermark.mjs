/**
 * Generate brand SVG assets using satori + Inter Bold.
 *
 * Renders the lettermark ("CV") and wordmark ("CompositeVoice") via satori,
 * extracts the typographic paths, and assembles clean adaptive SVGs with
 * CSS color-scheme support for automatic light/dark mode.
 *
 * Outputs:
 *  - packages/ui/src/brand-lettermark.svg      — bare adaptive lettermark
 *  - packages/ui/src/brand-icon.svg            — iconmark with rounded background
 *  - packages/ui/src/brand-wordmark.svg        — full "CompositeVoice" wordmark
 *  - apps/{docs,design,web}/public/favicon.svg — iconmark for browser favicons
 *
 * Usage: node scripts/generate-lettermark.mjs
 */

import satori from "satori";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/* ── Brand tokens ─────────────────────────────── */

const ACCENT = "#41cbbf"; // --primary (teal) — same in both modes
const BASE_LIGHT = "#1a1a1a"; // letterform color in light mode
const BASE_DARK = "#ffffff"; // letterform color in dark mode
const BG_LIGHT = "#ffffff"; // icon background in light mode
const BG_DARK = "#1a1a1a"; // icon background in dark mode

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

function buildSvg(width, height, { base, accent }, { background } = {}) {
  const bgRule = background
    ? `\n    .bg { fill: ${BG_LIGHT}; }`
    : "";
  const bgDarkRule = background
    ? `\n      .bg { fill: ${BG_DARK}; }`
    : "";
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

function write(filePath, content) {
  writeFileSync(filePath, content, "utf-8");
  console.log(`  ✓ ${filePath.replace(root + "/", "")}`);
}

/* ── 1. Render lettermark ("CV") ──────────────── */

console.log("Rendering lettermark…");
const lettermarkRaw = await render("C", "V", 128, 128, 80, "-0.02em");
const lettermarkPaths = extractPaths(lettermarkRaw);
console.log(`  ${lettermarkPaths.base.length} base path(s), ${lettermarkPaths.accent.length} accent path(s)`);

/* ── 2. Render wordmark ("CompositeVoice") ────── */

console.log("Rendering wordmark…");
const wordmarkRaw = await render("Composite", "Voice", 640, 96, 64, "-0.03em");
const wordmarkPaths = extractPaths(wordmarkRaw);
console.log(`  ${wordmarkPaths.base.length} base path(s), ${wordmarkPaths.accent.length} accent path(s)`);

/* ── 3. Build SVGs ────────────────────────────── */

const lettermarkSvg = buildSvg(128, 128, lettermarkPaths);
const iconSvg = buildSvg(128, 128, lettermarkPaths, { background: { rx: 28 } });
const wordmarkSvg = buildSvg(640, 96, wordmarkPaths);

/* ── 4. Write files ───────────────────────────── */

console.log("\nWriting SVGs:");

// Reference SVGs in UI package
write(join(root, "packages/ui/src/brand-lettermark.svg"), lettermarkSvg);
write(join(root, "packages/ui/src/brand-icon.svg"), iconSvg);
write(join(root, "packages/ui/src/brand-wordmark.svg"), wordmarkSvg);

// Favicons (all sites use the iconmark variant)
for (const app of ["docs", "design", "web"]) {
  write(join(root, `apps/${app}/public/favicon.svg`), iconSvg);
}

// Clean up legacy files
for (const old of ["brand-lettermark-light.svg"]) {
  const p = join(root, "packages/ui/src", old);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`  ✗ Removed old: packages/ui/src/${old}`);
  }
}

console.log("\nDone.");
