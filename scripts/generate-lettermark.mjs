/**
 * Generate the CV lettermark SVG using satori.
 *
 * Renders the BrandName lettermark ("CV") with the Inter Bold font via satori,
 * producing real typographic SVG paths instead of hand-drawn approximations.
 *
 * Outputs:
 *  - packages/ui/src/brand-lettermark.svg  (raw two-color SVG for reference)
 *  - stdout: the SVG path data for use in BrandIcon and favicons
 *
 * Usage: node scripts/generate-lettermark.mjs
 */

import satori from "satori";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load Inter Bold (latin subset)
const interBold = readFileSync(
  join(root, "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff")
);

// Brand colors
const PRIMARY = "#41cbbf"; // --primary (teal)
const BASE_LIGHT = "#1a1a1a"; // near-black for light mode
const BASE_DARK = "#ffffff"; // white for dark mode

// Render the lettermark via satori — tight fit around "CV"
const svg = await satori(
  {
    type: "div",
    props: {
      children: [
        {
          type: "span",
          props: {
            children: "C",
            style: { color: BASE_LIGHT },
          },
        },
        {
          type: "span",
          props: {
            children: "V",
            style: { color: PRIMARY },
          },
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
      {
        name: "Inter",
        data: interBold,
        weight: 700,
        style: "normal",
      },
    ],
  }
);

// Write the reference SVG
const refPath = join(root, "packages/ui/src/brand-lettermark.svg");
writeFileSync(refPath, svg, "utf-8");
console.log(`✓ Wrote reference SVG: ${refPath}`);

// Write the favicon SVG (with dark mode support)
// Parse the satori output to inject dark mode CSS
const faviconSvg = svg
  // Add a class to the base-color paths (the "C" letter)
  .replace(
    new RegExp(`fill="${BASE_LIGHT}"`, "g"),
    `fill="${BASE_LIGHT}" class="base"`
  )
  // Append a <style> before closing </svg>
  .replace(
    "</svg>",
    `<style>@media(prefers-color-scheme:dark){.base{fill:${BASE_DARK}}}</style></svg>`
  );

const faviconTargets = [
  join(root, "apps/docs/public/favicon.svg"),
  join(root, "apps/design/public/favicon.svg"),
  join(root, "apps/web/public/favicon.svg"),
];

for (const target of faviconTargets) {
  writeFileSync(target, faviconSvg, "utf-8");
  console.log(`✓ Wrote favicon: ${target}`);
}

// Extract path data from the SVG for use in the BrandIcon React component
// Satori outputs <path> elements — extract them
const pathRegex = /<path[^>]*?\bd="([^"]+)"[^>]*?fill="([^"]+)"[^>]*?\/>/g;
const paths = [];
let match;
while ((match = pathRegex.exec(svg)) !== null) {
  paths.push({ d: match[1], fill: match[2] });
}

console.log("\n— Path data for BrandIcon component —");
for (const p of paths) {
  const label = p.fill === PRIMARY ? "V (accent)" : "C (base)";
  console.log(`\n${label}:`);
  console.log(`  fill: ${p.fill}`);
  console.log(`  d: ${p.d}`);
}

// Also output a combined OG-watermark SVG (white C + teal V, for dark backgrounds)
const ogSvg = svg.replace(
  new RegExp(`fill="${BASE_LIGHT}"`, "g"),
  `fill="${BASE_DARK}"`
);
const ogPath = join(root, "packages/ui/src/brand-lettermark-light.svg");
writeFileSync(ogPath, ogSvg, "utf-8");
console.log(`\n✓ Wrote light-on-dark SVG: ${ogPath}`);

console.log("\nDone! Update BrandIcon paths in packages/ui/src/icons.tsx with the data above.");
