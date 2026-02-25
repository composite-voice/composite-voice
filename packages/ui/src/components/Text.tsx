/**
 * Text — polymorphic text component for semantic inline and block text.
 *
 * Renders the correct HTML element based on the `as` prop, ensuring
 * proper document semantics. Supports size, weight, color, alignment,
 * and truncation variants, all mapped to theme tokens.
 */

type TextElement =
  | "p"
  | "span"
  | "strong"
  | "em"
  | "small"
  | "mark"
  | "del"
  | "ins"
  | "code"
  | "kbd"
  | "abbr"
  | "cite"
  | "q"
  | "sub"
  | "sup"
  | "time"
  | "samp"
  | "var"
  | "figcaption"
  | "blockquote"
  | "pre"
  | "li"
  | "dt"
  | "dd"
  | "label";

type TextSize = "xs" | "sm" | "base" | "lg" | "xl" | "2xl";
type TextWeight = "normal" | "medium" | "semibold" | "bold";
type TextColor =
  | "default"
  | "muted"
  | "primary"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "inherit";
type TextAlign = "left" | "center" | "right" | "justify";

interface TextProps extends React.HTMLAttributes<HTMLElement> {
  /** HTML element to render */
  as?: TextElement;
  /** Font size mapped to the type scale */
  size?: TextSize;
  /** Font weight */
  weight?: TextWeight;
  /** Semantic color token */
  color?: TextColor;
  /** Text alignment */
  align?: TextAlign;
  /** Truncate with ellipsis (single line) */
  truncate?: boolean;
  /** Limit to N lines with ellipsis */
  lineClamp?: number;
  /** Content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

const sizeMap: Record<TextSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
};

const weightMap: Record<TextWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const colorMap: Record<TextColor, string> = {
  default: "text-foreground",
  muted: "text-foreground-muted",
  primary: "text-primary-600",
  secondary: "text-secondary-600",
  accent: "text-accent-600",
  success: "text-success-600",
  warning: "text-warning-600",
  danger: "text-danger-600",
  info: "text-info-600",
  inherit: "text-inherit",
};

const alignMap: Record<TextAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
};

export function Text({
  as: Element = "p",
  size = "base",
  weight = "normal",
  color = "default",
  align,
  truncate = false,
  lineClamp,
  className = "",
  children,
  ...props
}: TextProps) {
  const classes = [
    "font-sans",
    sizeMap[size],
    weightMap[weight],
    colorMap[color],
    align ? alignMap[align] : "",
    truncate ? "truncate" : "",
    lineClamp ? `line-clamp-${lineClamp}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Element className={classes} {...props}>
      {children}
    </Element>
  );
}
