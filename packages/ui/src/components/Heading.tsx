/**
 * Heading — semantic heading component with independent level and visual size.
 *
 * Separates the document outline level (h1–h6) from the visual presentation,
 * allowing correct heading hierarchy regardless of visual design needs.
 * Critical for screen readers and SEO, which rely on heading levels
 * to understand document structure.
 */

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
type HeadingSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
type HeadingWeight = "normal" | "medium" | "semibold" | "bold" | "extrabold";
type HeadingColor = "default" | "muted" | "primary" | "secondary" | "accent" | "inherit";
type HeadingTracking = "tighter" | "tight" | "normal" | "wide";

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Document outline level (determines h1–h6 element) */
  level: HeadingLevel;
  /** Visual size (independent of semantic level) */
  size?: HeadingSize;
  /** Font weight */
  weight?: HeadingWeight;
  /** Semantic color */
  color?: HeadingColor;
  /** Letter spacing */
  tracking?: HeadingTracking;
  /** Content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

const sizeMap: Record<HeadingSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
};

const defaultSizeForLevel: Record<HeadingLevel, HeadingSize> = {
  1: "4xl",
  2: "3xl",
  3: "2xl",
  4: "xl",
  5: "lg",
  6: "md",
};

const weightMap: Record<HeadingWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
  extrabold: "font-extrabold",
};

const colorMap: Record<HeadingColor, string> = {
  default: "text-foreground",
  muted: "text-foreground-muted",
  primary: "text-primary-600",
  secondary: "text-secondary-600",
  accent: "text-accent-600",
  inherit: "text-inherit",
};

const trackingMap: Record<HeadingTracking, string> = {
  tighter: "tracking-tighter",
  tight: "tracking-tight",
  normal: "tracking-normal",
  wide: "tracking-wide",
};

export function Heading({
  level,
  size,
  weight = "bold",
  color = "default",
  tracking = "tight",
  className = "",
  children,
  ...props
}: HeadingProps) {
  const Element = `h${level}` as const;
  const resolvedSize = size ?? defaultSizeForLevel[level];

  const classes = [
    "font-heading",
    sizeMap[resolvedSize],
    weightMap[weight],
    colorMap[color],
    trackingMap[tracking],
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
