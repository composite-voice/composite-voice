import {
  ColorPalette,
  ColorSwatch,
  Heading,
  Text,
  BrandName,
} from "composite-voice-ui";

const palettes = [
  {
    name: "Primary",
    description: "Indigo — used for primary actions, links, and focus states.",
    shades: [
      { shade: "50", bg: "bg-primary-50", token: "--color-primary-50" },
      { shade: "100", bg: "bg-primary-100", token: "--color-primary-100" },
      { shade: "200", bg: "bg-primary-200", token: "--color-primary-200" },
      { shade: "300", bg: "bg-primary-300", token: "--color-primary-300" },
      { shade: "400", bg: "bg-primary-400", token: "--color-primary-400" },
      { shade: "500", bg: "bg-primary-500", token: "--color-primary-500" },
      { shade: "600", bg: "bg-primary-600", token: "--color-primary-600" },
      { shade: "700", bg: "bg-primary-700", token: "--color-primary-700" },
      { shade: "800", bg: "bg-primary-800", token: "--color-primary-800" },
      { shade: "900", bg: "bg-primary-900", token: "--color-primary-900" },
      { shade: "950", bg: "bg-primary-950", token: "--color-primary-950" },
    ],
  },
  {
    name: "Secondary",
    description: "Slate — used for secondary text, borders, and subtle backgrounds.",
    shades: [
      { shade: "50", bg: "bg-secondary-50", token: "--color-secondary-50" },
      { shade: "100", bg: "bg-secondary-100", token: "--color-secondary-100" },
      { shade: "200", bg: "bg-secondary-200", token: "--color-secondary-200" },
      { shade: "300", bg: "bg-secondary-300", token: "--color-secondary-300" },
      { shade: "400", bg: "bg-secondary-400", token: "--color-secondary-400" },
      { shade: "500", bg: "bg-secondary-500", token: "--color-secondary-500" },
      { shade: "600", bg: "bg-secondary-600", token: "--color-secondary-600" },
      { shade: "700", bg: "bg-secondary-700", token: "--color-secondary-700" },
      { shade: "800", bg: "bg-secondary-800", token: "--color-secondary-800" },
      { shade: "900", bg: "bg-secondary-900", token: "--color-secondary-900" },
      { shade: "950", bg: "bg-secondary-950", token: "--color-secondary-950" },
    ],
  },
  {
    name: "Accent",
    description: "Violet — used for highlights, badges, and decorative elements.",
    shades: [
      { shade: "50", bg: "bg-accent-50", token: "--color-accent-50" },
      { shade: "100", bg: "bg-accent-100", token: "--color-accent-100" },
      { shade: "200", bg: "bg-accent-200", token: "--color-accent-200" },
      { shade: "300", bg: "bg-accent-300", token: "--color-accent-300" },
      { shade: "400", bg: "bg-accent-400", token: "--color-accent-400" },
      { shade: "500", bg: "bg-accent-500", token: "--color-accent-500" },
      { shade: "600", bg: "bg-accent-600", token: "--color-accent-600" },
      { shade: "700", bg: "bg-accent-700", token: "--color-accent-700" },
      { shade: "800", bg: "bg-accent-800", token: "--color-accent-800" },
      { shade: "900", bg: "bg-accent-900", token: "--color-accent-900" },
      { shade: "950", bg: "bg-accent-950", token: "--color-accent-950" },
    ],
  },
  {
    name: "Success",
    description: "Emerald — used for success states, confirmations, and positive indicators.",
    shades: [
      { shade: "50", bg: "bg-success-50", token: "--color-success-50" },
      { shade: "100", bg: "bg-success-100", token: "--color-success-100" },
      { shade: "200", bg: "bg-success-200", token: "--color-success-200" },
      { shade: "300", bg: "bg-success-300", token: "--color-success-300" },
      { shade: "400", bg: "bg-success-400", token: "--color-success-400" },
      { shade: "500", bg: "bg-success-500", token: "--color-success-500" },
      { shade: "600", bg: "bg-success-600", token: "--color-success-600" },
      { shade: "700", bg: "bg-success-700", token: "--color-success-700" },
      { shade: "800", bg: "bg-success-800", token: "--color-success-800" },
      { shade: "900", bg: "bg-success-900", token: "--color-success-900" },
      { shade: "950", bg: "bg-success-950", token: "--color-success-950" },
    ],
  },
  {
    name: "Warning",
    description: "Amber — used for warnings, caution states, and attention indicators.",
    shades: [
      { shade: "50", bg: "bg-warning-50", token: "--color-warning-50" },
      { shade: "100", bg: "bg-warning-100", token: "--color-warning-100" },
      { shade: "200", bg: "bg-warning-200", token: "--color-warning-200" },
      { shade: "300", bg: "bg-warning-300", token: "--color-warning-300" },
      { shade: "400", bg: "bg-warning-400", token: "--color-warning-400" },
      { shade: "500", bg: "bg-warning-500", token: "--color-warning-500" },
      { shade: "600", bg: "bg-warning-600", token: "--color-warning-600" },
      { shade: "700", bg: "bg-warning-700", token: "--color-warning-700" },
      { shade: "800", bg: "bg-warning-800", token: "--color-warning-800" },
      { shade: "900", bg: "bg-warning-900", token: "--color-warning-900" },
      { shade: "950", bg: "bg-warning-950", token: "--color-warning-950" },
    ],
  },
  {
    name: "Danger",
    description: "Rose — used for error states, destructive actions, and critical alerts.",
    shades: [
      { shade: "50", bg: "bg-danger-50", token: "--color-danger-50" },
      { shade: "100", bg: "bg-danger-100", token: "--color-danger-100" },
      { shade: "200", bg: "bg-danger-200", token: "--color-danger-200" },
      { shade: "300", bg: "bg-danger-300", token: "--color-danger-300" },
      { shade: "400", bg: "bg-danger-400", token: "--color-danger-400" },
      { shade: "500", bg: "bg-danger-500", token: "--color-danger-500" },
      { shade: "600", bg: "bg-danger-600", token: "--color-danger-600" },
      { shade: "700", bg: "bg-danger-700", token: "--color-danger-700" },
      { shade: "800", bg: "bg-danger-800", token: "--color-danger-800" },
      { shade: "900", bg: "bg-danger-900", token: "--color-danger-900" },
      { shade: "950", bg: "bg-danger-950", token: "--color-danger-950" },
    ],
  },
  {
    name: "Info",
    description: "Sky — used for informational states, tips, and neutral highlights.",
    shades: [
      { shade: "50", bg: "bg-info-50", token: "--color-info-50" },
      { shade: "100", bg: "bg-info-100", token: "--color-info-100" },
      { shade: "200", bg: "bg-info-200", token: "--color-info-200" },
      { shade: "300", bg: "bg-info-300", token: "--color-info-300" },
      { shade: "400", bg: "bg-info-400", token: "--color-info-400" },
      { shade: "500", bg: "bg-info-500", token: "--color-info-500" },
      { shade: "600", bg: "bg-info-600", token: "--color-info-600" },
      { shade: "700", bg: "bg-info-700", token: "--color-info-700" },
      { shade: "800", bg: "bg-info-800", token: "--color-info-800" },
      { shade: "900", bg: "bg-info-900", token: "--color-info-900" },
      { shade: "950", bg: "bg-info-950", token: "--color-info-950" },
    ],
  },
  {
    name: "Neutral",
    description: "Zinc — used for text, borders, dividers, and structural UI elements.",
    shades: [
      { shade: "50", bg: "bg-neutral-50", token: "--color-neutral-50" },
      { shade: "100", bg: "bg-neutral-100", token: "--color-neutral-100" },
      { shade: "200", bg: "bg-neutral-200", token: "--color-neutral-200" },
      { shade: "300", bg: "bg-neutral-300", token: "--color-neutral-300" },
      { shade: "400", bg: "bg-neutral-400", token: "--color-neutral-400" },
      { shade: "500", bg: "bg-neutral-500", token: "--color-neutral-500" },
      { shade: "600", bg: "bg-neutral-600", token: "--color-neutral-600" },
      { shade: "700", bg: "bg-neutral-700", token: "--color-neutral-700" },
      { shade: "800", bg: "bg-neutral-800", token: "--color-neutral-800" },
      { shade: "900", bg: "bg-neutral-900", token: "--color-neutral-900" },
      { shade: "950", bg: "bg-neutral-950", token: "--color-neutral-950" },
    ],
  },
];

const surfaceTokens = [
  { name: "Surface", bg: "bg-surface", token: "--color-surface" },
  { name: "Surface Raised", bg: "bg-surface-raised", token: "--color-surface-raised" },
  { name: "Surface Sunken", bg: "bg-surface-sunken", token: "--color-surface-sunken" },
];

export default function ColorsShowcase() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <Heading level={2}>Color System</Heading>
        <Text color="muted">
          The <BrandName /> color system is built on semantic naming
          conventions with token-derived palettes. Each palette is generated
          from a single base color via <code>color-mix(in oklch)</code> — change
          one token to re-theme its entire scale across light and dark modes.
        </Text>
        <Text color="muted">
          Every palette spans 11 shades from 50 (lightest) through 950
          (darkest). Dark mode inverts the scale automatically. Shades maintain
          WCAG 2.1 AA contrast ratios when paired appropriately: light
          backgrounds (50–200) with dark text, and dark backgrounds (600–950)
          with white or light text.
        </Text>
        <Text color="muted">
          When choosing colors, prefer semantic tokens over specific shades.
          Use primary for interactive elements, secondary for supporting
          content, and status palettes (success, warning, danger, info)
          exclusively for their intended feedback states.
        </Text>
      </section>

      {palettes.map((palette) => (
        <section key={palette.name} className="space-y-3">
          <div>
            <Heading level={3} size="lg">{palette.name}</Heading>
            <Text color="muted" size="sm">{palette.description}</Text>
          </div>
          <ColorPalette
            name={palette.name}
            shades={palette.shades}
          />
        </section>
      ))}

      <section className="space-y-4">
        <div>
          <Heading level={3} size="lg">Surface Tokens</Heading>
          <Text color="muted" size="sm">
            Surface tokens define layered backgrounds. Use surface for default
            backgrounds, surface-raised for cards, and surface-sunken for
            recessed areas like input fields.
          </Text>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg">
          {surfaceTokens.map((token) => (
            <ColorSwatch
              key={token.name}
              name={token.name}
              bg={token.bg}
              token={token.token}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
