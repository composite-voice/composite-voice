/**
 * Skeleton — content placeholder for loading states.
 *
 * Composes VisuallyHidden for screen reader announcements.
 * Uses a shimmer animation (background-position based) for
 * a polished loading effect.
 *
 * Variants:
 * - text: Rounded rectangle mimicking a line of text
 * - circular: Circle (avatar placeholder)
 * - rectangular: Sharp-cornered rectangle (image placeholder)
 * - rounded: Rounded rectangle (card/button placeholder)
 */

import { VisuallyHidden } from "./VisuallyHidden";

type SkeletonVariant = "text" | "circular" | "rectangular" | "rounded";

interface SkeletonProps {
  /** Shape variant */
  variant?: SkeletonVariant;
  /** Width (CSS value or Tailwind class) */
  width?: string;
  /** Height (CSS value or Tailwind class) */
  height?: string;
  /** Number of text lines (only for text variant) */
  lines?: number;
  /** Enable shimmer animation */
  animate?: boolean;
  /** Screen reader label */
  label?: string;
  /** Additional class names */
  className?: string;
}

const variantStyles: Record<SkeletonVariant, string> = {
  text: "rounded",
  circular: "rounded-full",
  rectangular: "rounded-none",
  rounded: "rounded-lg",
};

const shimmerClass =
  "bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200 bg-[length:200%_100%] animate-skeleton";

const staticClass = "bg-neutral-200";

export function Skeleton({
  variant = "text",
  width,
  height,
  lines = 1,
  animate = true,
  label = "Loading content",
  className = "",
}: SkeletonProps) {
  const baseClass = animate ? shimmerClass : staticClass;
  const shapeClass = variantStyles[variant];

  if (variant === "text" && lines > 1) {
    return (
      <div role="status" aria-live="polite" className={`flex flex-col gap-2 ${className}`}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={`${baseClass} ${shapeClass} h-4 ${i === lines - 1 ? "w-3/4" : "w-full"}`}
            style={width ? { width } : undefined}
          />
        ))}
        <VisuallyHidden>{label}</VisuallyHidden>
      </div>
    );
  }

  const defaultDimensions: Record<SkeletonVariant, { w: string; h: string }> = {
    text: { w: "w-full", h: "h-4" },
    circular: { w: "w-10", h: "h-10" },
    rectangular: { w: "w-full", h: "h-32" },
    rounded: { w: "w-full", h: "h-24" },
  };

  const dims = defaultDimensions[variant];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${baseClass} ${shapeClass} ${width ? "" : dims.w} ${height ? "" : dims.h} ${className}`}
      style={{
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      }}
    >
      <VisuallyHidden>{label}</VisuallyHidden>
    </div>
  );
}
