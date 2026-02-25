import {
  ColorPalette,
  ColorSwatch,
  Heading,
  Text,
} from "@lukeocodes/composite-voice-ui";

const shadeSteps = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

const palettes = [
  {
    name: "Primary",
    description: "Indigo — used for primary actions, links, and focus states.",
    tokenPrefix: "--color-primary",
    classPrefix: "primary",
  },
  {
    name: "Secondary",
    description: "Slate — used for secondary text, borders, and subtle backgrounds.",
    tokenPrefix: "--color-secondary",
    classPrefix: "secondary",
  },
  {
    name: "Accent",
    description: "Violet — used for highlights, badges, and decorative elements.",
    tokenPrefix: "--color-accent",
    classPrefix: "accent",
  },
  {
    name: "Success",
    description: "Emerald — used for success states, confirmations, and positive indicators.",
    tokenPrefix: "--color-success",
    classPrefix: "success",
  },
  {
    name: "Warning",
    description: "Amber — used for warnings, caution states, and attention indicators.",
    tokenPrefix: "--color-warning",
    classPrefix: "warning",
  },
  {
    name: "Danger",
    description: "Rose — used for error states, destructive actions, and critical alerts.",
    tokenPrefix: "--color-danger",
    classPrefix: "danger",
  },
  {
    name: "Info",
    description: "Sky — used for informational states, tips, and neutral highlights.",
    tokenPrefix: "--color-info",
    classPrefix: "info",
  },
  {
    name: "Neutral",
    description: "Zinc — used for text, borders, dividers, and structural UI elements.",
    tokenPrefix: "--color-neutral",
    classPrefix: "neutral",
  },
].map((palette) => ({
  ...palette,
  shades: shadeSteps.map((shade) => ({ shade })),
}));

const surfaceTokens = [
  { name: "Surface", token: "--color-surface" },
  { name: "Surface Raised", token: "--color-surface-raised" },
  { name: "Surface Sunken", token: "--color-surface-sunken" },
];

export default function ColorsShowcase() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <Heading level={2}>Color System</Heading>
        <Text color="muted">
          The CompositeVoice color system is built on semantic naming
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
            tokenPrefix={palette.tokenPrefix}
            classPrefix={palette.classPrefix}
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
              value={token.value}
              token={token.token}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
