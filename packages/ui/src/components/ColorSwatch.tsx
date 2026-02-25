/**
 * ColorSwatch — design system display component for color tokens.
 *
 * Composes Text for metadata display. Used in the design system
 * documentation to showcase the color palette with hex values,
 * CSS variable names, and WCAG contrast information.
 */

import { Text } from "./Text";

interface ColorSwatchProps {
  /** Display name (e.g., "Primary 600") */
  name: string;
  /** Hex or CSS color value (optional when token is provided) */
  value?: string;
  /** CSS custom property name — used for background color and label */
  token?: string;
  /** Tailwind utility class name */
  utilityClass?: string;
  /** Whether to show light text on this swatch */
  lightText?: boolean;
  /** Additional class names */
  className?: string;
}

export function ColorSwatch({
  name,
  value,
  token,
  utilityClass,
  lightText = false,
  className = "",
}: ColorSwatchProps) {
  return (
    <div
      className={`rounded-lg overflow-hidden border border-neutral-200 ${className}`}
      title={[token, utilityClass].filter(Boolean).join("\n")}
    >
      <div
        className="h-20 w-full flex items-end p-3"
        style={{ backgroundColor: token ? `var(${token})` : value }}
      >
        <Text
          as="span"
          size="sm"
          weight="semibold"
          color="inherit"
          className={lightText ? "text-on-filled" : "text-foreground"}
        >
          {name}
        </Text>
      </div>
      <div className="px-3 py-2 bg-surface">
        <Text as="p" size="xs" color="default" weight="medium" className="font-mono">
          {token || value}
        </Text>
      </div>
    </div>
  );
}

/* ── ColorPalette — renders a full shade scale as a continuous strip ── */

interface ColorShade {
  shade: string;
  value?: string;
  lightText?: boolean;
}

interface ColorPaletteProps {
  /** Palette name (e.g., "Primary") */
  name: string;
  /** CSS variable prefix (e.g., "--color-primary") */
  tokenPrefix: string;
  /** Tailwind class prefix (e.g., "primary") */
  classPrefix: string;
  /** Array of shade objects */
  shades: ColorShade[];
  /** Additional class names */
  className?: string;
}

export function ColorPalette({
  tokenPrefix,
  classPrefix,
  shades,
  className = "",
}: ColorPaletteProps) {
  return (
    <div className={className}>
      {/* Continuous color strip */}
      <div className="flex rounded-xl overflow-hidden">
        {shades.map((shade) => (
          <div
            key={shade.shade}
            className="flex-1 h-14 relative group cursor-default"
            style={{ backgroundColor: shade.value || `var(${tokenPrefix}-${shade.shade})` }}
            title={`${tokenPrefix}-${shade.shade}\nbg-${classPrefix}-${shade.shade}`}
          />
        ))}
      </div>

      {/* Labels row */}
      <div className="flex mt-2">
        {shades.map((shade) => (
          <div key={shade.shade} className="flex-1 min-w-0 px-0.5">
            <Text as="p" size="xs" weight="medium" color="default" className="text-center">
              {shade.shade}
            </Text>
            <Text as="p" size="xs" color="muted" className="font-mono text-center truncate hidden sm:block">
              {shade.value || `${tokenPrefix}-${shade.shade}`}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}
