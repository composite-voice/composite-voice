/**
 * Generate brand SVG assets from the CV lettermark using satori.
 *
 * Renders "CV" with Inter Bold via satori to produce real typographic
 * SVG paths, then assembles clean, adaptive SVGs with CSS color-scheme
 * support for light/dark mode.
 *
 * Outputs:
 *  - packages/ui/src/brand-lettermark.svg     — bare adaptive lettermark
 *  - packages/ui/src/brand-icon.svg           — iconmark with rounded background
 *  - apps/{docs,design,web}/public/favicon.svg — iconmark for browser favicons
 *
 * Usage: node scripts/generate-lettermark.mjs
 */

import satori from "satori";
import { readFileSync, writeFileSync } from "fs";
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

/* ── 1. Render via satori ─────────────────────── */

const interBold = readFileSync(
  join(root, "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff")
);

const rawSvg = await satori(
  {
    type: "div",
    props: {
      children: [
        {
          type: "span",
          props: { children: "C", style: { color: BASE_LIGHT } },
        },
        {
          type: "span",
          props: { children: "V", style: { color: ACCENT } },
        },
      ],
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter",
        fontWeight: 700,
        fontSize: 80,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        width: "100%",
        height: "100%",
      },
    },
  },
  {
    width: 128,
    height: 128,
    fonts: [
      { name: "Inter", data: interBold, weight: 700, style: "normal" },
    ],
  }
);

/* ── 2. Extract path data ─────────────────────── */

// Satori wraps paths in <g> with masks — extract the raw path `d` attributes
const pathRegex = /fill="([^"]+)"[^>]*?\bd="([^"]+)"/g;
const paths = [];
let m;
while ((m = pathRegex.exec(rawSvg)) !== null) {
  paths.push({ fill: m[1], d: m[2] });
}

const basePath = paths.find((p) => p.fill === BASE_LIGHT);
const accentPath = paths.find((p) => p.fill === ACCENT);

if (!basePath || !accentPath) {
  console.error("Failed to extract path data from satori output.");
  console.error("Raw SVG:", rawSvg);
  process.exit(1);
}

console.log("Extracted paths:");
console.log(`  C (base):   ${basePath.d.slice(0, 60)}…`);
console.log(`  V (accent): ${accentPath.d.slice(0, 60)}…`);

/* ── 3. Build adaptive lettermark SVG ─────────── */

const lettermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <style>
    .base { fill: ${BASE_LIGHT}; }
    .accent { fill: ${ACCENT}; }
    @media (prefers-color-scheme: dark) {
      .base { fill: ${BASE_DARK}; }
    }
  </style>
  <path class="base" d="${basePath.d}"/>
  <path class="accent" d="${accentPath.d}"/>
</svg>
`;

/* ── 4. Build adaptive iconmark SVG ───────────── */

const ICON_RADIUS = 28; // ~22% of 128 — modern app-icon feel

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <style>
    .bg { fill: ${BG_LIGHT}; }
    .base { fill: ${BASE_LIGHT}; }
    .accent { fill: ${ACCENT}; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: ${BG_DARK}; }
      .base { fill: ${BASE_DARK}; }
    }
  </style>
  <rect class="bg" width="128" height="128" rx="${ICON_RADIUS}"/>
  <path class="base" d="${basePath.d}"/>
  <path class="accent" d="${accentPath.d}"/>
</svg>
`;

/* ── 5. Write files ───────────────────────────── */

function write(filePath, content) {
  writeFileSync(filePath, content, "utf-8");
  console.log(`  ✓ ${filePath.replace(root + "/", "")}`);
}

console.log("\nWriting SVGs:");

// Reference SVGs in UI package
write(join(root, "packages/ui/src/brand-lettermark.svg"), lettermarkSvg);
write(join(root, "packages/ui/src/brand-icon.svg"), iconSvg);

// Favicons (all sites use the iconmark variant)
const faviconTargets = [
  "apps/docs/public/favicon.svg",
  "apps/design/public/favicon.svg",
  "apps/web/public/favicon.svg",
];
for (const rel of faviconTargets) {
  write(join(root, rel), iconSvg);
}

// Clean up old light variant (replaced by adaptive approach)
import { existsSync, unlinkSync } from "fs";
const oldLight = join(root, "packages/ui/src/brand-lettermark-light.svg");
if (existsSync(oldLight)) {
  unlinkSync(oldLight);
  console.log(`  ✗ Removed old: packages/ui/src/brand-lettermark-light.svg`);
}

/* ── 6. Print path data for BrandIcon ─────────── */

console.log("\n— Path data (for BrandIcon in icons.tsx) —");
console.log(`C (base): ${basePath.d}`);
console.log(`V (accent): ${accentPath.d}`);
console.log("\nDone.");
