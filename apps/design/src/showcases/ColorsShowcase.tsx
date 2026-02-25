import {
  ColorPalette,
  ColorSwatch,
  Heading,
  Text,
} from "@lukeocodes/composite-voice-ui";

const palettes = [
  {
    name: "Primary",
    description: "Indigo — used for primary actions, links, and focus states.",
    tokenPrefix: "--color-primary",
    classPrefix: "primary",
    shades: [
      { shade: "50", value: "#eef2ff" },
      { shade: "100", value: "#e0e7ff" },
      { shade: "200", value: "#c7d2fe" },
      { shade: "300", value: "#a5b4fc" },
      { shade: "400", value: "#818cf8" },
      { shade: "500", value: "#6366f1", lightText: true },
      { shade: "600", value: "#4f46e5", lightText: true },
      { shade: "700", value: "#4338ca", lightText: true },
      { shade: "800", value: "#3730a3", lightText: true },
      { shade: "900", value: "#312e81", lightText: true },
      { shade: "950", value: "#1e1b4b", lightText: true },
    ],
  },
  {
    name: "Secondary",
    description: "Slate — used for secondary text, borders, and subtle backgrounds.",
    tokenPrefix: "--color-secondary",
    classPrefix: "secondary",
    shades: [
      { shade: "50", value: "#f8fafc" },
      { shade: "100", value: "#f1f5f9" },
      { shade: "200", value: "#e2e8f0" },
      { shade: "300", value: "#cbd5e1" },
      { shade: "400", value: "#94a3b8" },
      { shade: "500", value: "#64748b", lightText: true },
      { shade: "600", value: "#475569", lightText: true },
      { shade: "700", value: "#334155", lightText: true },
      { shade: "800", value: "#1e293b", lightText: true },
      { shade: "900", value: "#0f172a", lightText: true },
      { shade: "950", value: "#020617", lightText: true },
    ],
  },
  {
    name: "Accent",
    description: "Violet — used for highlights, badges, and decorative elements.",
    tokenPrefix: "--color-accent",
    classPrefix: "accent",
    shades: [
      { shade: "50", value: "#f5f3ff" },
      { shade: "100", value: "#ede9fe" },
      { shade: "200", value: "#ddd6fe" },
      { shade: "300", value: "#c4b5fd" },
      { shade: "400", value: "#a78bfa" },
      { shade: "500", value: "#8b5cf6", lightText: true },
      { shade: "600", value: "#7c3aed", lightText: true },
      { shade: "700", value: "#6d28d9", lightText: true },
      { shade: "800", value: "#5b21b6", lightText: true },
      { shade: "900", value: "#4c1d95", lightText: true },
      { shade: "950", value: "#2e1065", lightText: true },
    ],
  },
  {
    name: "Success",
    description: "Emerald — used for success states, confirmations, and positive indicators.",
    tokenPrefix: "--color-success",
    classPrefix: "success",
    shades: [
      { shade: "50", value: "#ecfdf5" },
      { shade: "100", value: "#d1fae5" },
      { shade: "200", value: "#a7f3d0" },
      { shade: "300", value: "#6ee7b7" },
      { shade: "400", value: "#34d399" },
      { shade: "500", value: "#10b981", lightText: true },
      { shade: "600", value: "#059669", lightText: true },
      { shade: "700", value: "#047857", lightText: true },
      { shade: "800", value: "#065f46", lightText: true },
      { shade: "900", value: "#064e3b", lightText: true },
      { shade: "950", value: "#022c22", lightText: true },
    ],
  },
  {
    name: "Warning",
    description: "Amber — used for warnings, caution states, and attention indicators.",
    tokenPrefix: "--color-warning",
    classPrefix: "warning",
    shades: [
      { shade: "50", value: "#fffbeb" },
      { shade: "100", value: "#fef3c7" },
      { shade: "200", value: "#fde68a" },
      { shade: "300", value: "#fcd34d" },
      { shade: "400", value: "#fbbf24" },
      { shade: "500", value: "#f59e0b" },
      { shade: "600", value: "#d97706", lightText: true },
      { shade: "700", value: "#b45309", lightText: true },
      { shade: "800", value: "#92400e", lightText: true },
      { shade: "900", value: "#78350f", lightText: true },
      { shade: "950", value: "#451a03", lightText: true },
    ],
  },
  {
    name: "Danger",
    description: "Rose — used for error states, destructive actions, and critical alerts.",
    tokenPrefix: "--color-danger",
    classPrefix: "danger",
    shades: [
      { shade: "50", value: "#fff1f2" },
      { shade: "100", value: "#ffe4e6" },
      { shade: "200", value: "#fecdd3" },
      { shade: "300", value: "#fda4af" },
      { shade: "400", value: "#fb7185" },
      { shade: "500", value: "#f43f5e", lightText: true },
      { shade: "600", value: "#e11d48", lightText: true },
      { shade: "700", value: "#be123c", lightText: true },
      { shade: "800", value: "#9f1239", lightText: true },
      { shade: "900", value: "#881337", lightText: true },
      { shade: "950", value: "#4c0519", lightText: true },
    ],
  },
  {
    name: "Info",
    description: "Sky — used for informational states, tips, and neutral highlights.",
    tokenPrefix: "--color-info",
    classPrefix: "info",
    shades: [
      { shade: "50", value: "#f0f9ff" },
      { shade: "100", value: "#e0f2fe" },
      { shade: "200", value: "#bae6fd" },
      { shade: "300", value: "#7dd3fc" },
      { shade: "400", value: "#38bdf8" },
      { shade: "500", value: "#0ea5e9", lightText: true },
      { shade: "600", value: "#0284c7", lightText: true },
      { shade: "700", value: "#0369a1", lightText: true },
      { shade: "800", value: "#075985", lightText: true },
      { shade: "900", value: "#0c4a6e", lightText: true },
      { shade: "950", value: "#082f49", lightText: true },
    ],
  },
  {
    name: "Neutral",
    description: "Zinc — used for text, borders, dividers, and structural UI elements.",
    tokenPrefix: "--color-neutral",
    classPrefix: "neutral",
    shades: [
      { shade: "50", value: "#fafafa" },
      { shade: "100", value: "#f4f4f5" },
      { shade: "200", value: "#e4e4e7" },
      { shade: "300", value: "#d4d4d8" },
      { shade: "400", value: "#a1a1aa" },
      { shade: "500", value: "#71717a", lightText: true },
      { shade: "600", value: "#52525b", lightText: true },
      { shade: "700", value: "#3f3f46", lightText: true },
      { shade: "800", value: "#27272a", lightText: true },
      { shade: "900", value: "#18181b", lightText: true },
      { shade: "950", value: "#09090b", lightText: true },
    ],
  },
];

const surfaceTokens = [
  { name: "Surface", value: "#ffffff", token: "--color-surface" },
  { name: "Surface Raised", value: "#fafafa", token: "--color-surface-raised" },
  { name: "Surface Sunken", value: "#f4f4f5", token: "--color-surface-sunken" },
];

export default function ColorsShowcase() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <Heading level={2}>Color System</Heading>
        <Text color="muted">
          The CompositeVoice color system is built on semantic naming
          conventions. Rather than referencing raw hex values directly, colors
          are organized into purpose-driven palettes — primary for actions,
          danger for errors, success for confirmations, and so on.
        </Text>
        <Text color="muted">
          Every palette spans 11 shades from 50 (lightest) through 950
          (darkest). Shades are selected to maintain WCAG 2.1 AA contrast
          ratios when paired appropriately: light backgrounds (50–200) with
          dark text, and dark backgrounds (600–950) with white or light text.
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
