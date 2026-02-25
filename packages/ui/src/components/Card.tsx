/**
 * Card — content container with semantic HTML and Schema.org support.
 *
 * Composes Heading and Text for structured content areas.
 * Supports Schema.org microdata via itemScope/itemType for
 * rich search results and GEO (Generative Engine Optimization).
 *
 * Sub-components: CardHeader, CardBody, CardFooter, CardImage,
 * CardTitle, CardDescription — all compose primitives.
 *
 * Accessibility:
 * - Uses <article> by default for independent content units
 * - Interactive cards use role="link" or role="button" patterns
 * - Focus ring on interactive variants for keyboard navigation
 */

import { Heading } from "./Heading";
import { Text } from "./Text";

type CardVariant = "default" | "outlined" | "elevated" | "filled";
type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Visual style */
  variant?: CardVariant;
  /** Internal padding */
  padding?: CardPadding;
  /** Hoverable/clickable card */
  interactive?: boolean;
  /** Semantic HTML element */
  as?: "div" | "article" | "section" | "aside";
  /** Schema.org item type URL */
  itemType?: string;
  /** Additional class names */
  className?: string;
  /** Card content */
  children: React.ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-surface border border-neutral-200 shadow-card",
  outlined: "bg-surface border border-neutral-200",
  elevated: "bg-surface shadow-card-hover",
  filled: "bg-neutral-50 border border-transparent",
};

const paddingStyles: Record<CardPadding, string> = {
  none: "",
  sm: "[&>:not(.card-image)]:px-3 [&>:not(.card-image)]:py-2",
  md: "[&>:not(.card-image)]:px-5 [&>:not(.card-image)]:py-4",
  lg: "[&>:not(.card-image)]:px-6 [&>:not(.card-image)]:py-5",
};

export function Card({
  variant = "default",
  padding = "none",
  interactive = false,
  as: Element = "article",
  itemType,
  className = "",
  children,
  ...props
}: CardProps) {
  const classes = [
    "rounded-card overflow-hidden transition-all duration-200",
    variantStyles[variant],
    paddingStyles[padding],
    interactive
      ? "cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Element
      className={classes}
      itemScope={itemType ? true : undefined}
      itemType={itemType}
      tabIndex={interactive ? 0 : undefined}
      {...props}
    >
      {children}
    </Element>
  );
}

/* ── Sub-components ────────────────────────────── */

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  /** Render a bottom border */
  bordered?: boolean;
}

export function CardHeader({ children, className = "", bordered = false }: CardHeaderProps) {
  return (
    <header
      className={`px-5 py-4 ${bordered ? "border-b border-neutral-200" : ""} ${className}`}
    >
      {children}
    </header>
  );
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function CardBody({ children, className = "" }: CardBodyProps) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
  /** Render a top border */
  bordered?: boolean;
}

export function CardFooter({ children, className = "", bordered = false }: CardFooterProps) {
  return (
    <footer
      className={`px-5 py-4 ${bordered ? "border-t border-neutral-200" : ""} ${className}`}
    >
      {children}
    </footer>
  );
}

interface CardImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Schema.org image property name */
  itemProp?: string;
  /** Aspect ratio class (e.g., "aspect-video", "aspect-square") */
  aspect?: string;
}

export function CardImage({
  className = "",
  aspect = "aspect-video",
  alt = "",
  itemProp = "image",
  ...props
}: CardImageProps) {
  return (
    <div className={`card-image overflow-hidden ${aspect}`}>
      <img
        className={`w-full h-full object-cover ${className}`}
        alt={alt}
        itemProp={itemProp}
        {...props}
      />
    </div>
  );
}

interface CardTitleProps {
  children: React.ReactNode;
  level?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

export function CardTitle({ children, level = 3, className = "" }: CardTitleProps) {
  return (
    <Heading level={level} size="lg" weight="semibold" className={className}>
      <span itemProp="name">{children}</span>
    </Heading>
  );
}

interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function CardDescription({ children, className = "" }: CardDescriptionProps) {
  return (
    <Text as="p" size="sm" color="muted" className={`mt-1 ${className}`}>
      <span itemProp="description">{children}</span>
    </Text>
  );
}
