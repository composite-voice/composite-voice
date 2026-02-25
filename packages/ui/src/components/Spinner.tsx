/**
 * Spinner — animated loading indicator.
 *
 * Composes VisuallyHidden for the screen reader announcement.
 * Uses CSS animation (animate-spin) for smooth rotation.
 * Announces loading state via aria-live region.
 *
 * The SVG uses a partial circle (270° arc) with currentColor
 * so it inherits the parent's text color.
 */

import { VisuallyHidden } from "./VisuallyHidden";

type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";
type SpinnerColor = "primary" | "secondary" | "white" | "current" | "danger" | "success";

interface SpinnerProps {
  /** Size preset */
  size?: SpinnerSize;
  /** Color variant */
  color?: SpinnerColor;
  /** Screen reader label */
  label?: string;
  /** Additional class names */
  className?: string;
}

const sizeMap: Record<SpinnerSize, string> = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  xl: "w-12 h-12",
};

const colorMap: Record<SpinnerColor, { track: string; indicator: string }> = {
  primary: { track: "text-primary-200", indicator: "text-primary-600" },
  secondary: { track: "text-secondary-200", indicator: "text-secondary-600" },
  white: { track: "text-on-filled/30", indicator: "text-on-filled" },
  current: { track: "text-current/20", indicator: "text-current" },
  danger: { track: "text-danger-200", indicator: "text-danger-600" },
  success: { track: "text-success-200", indicator: "text-success-600" },
};

export function Spinner({
  size = "md",
  color = "primary",
  label = "Loading",
  className = "",
}: SpinnerProps) {
  const { track, indicator } = colorMap[color];

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center justify-center ${className}`}
    >
      <span className={`relative ${sizeMap[size]}`}>
        {/* Track (full circle, muted) */}
        <svg
          className={`absolute inset-0 ${sizeMap[size]} ${track}`}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        </svg>
        {/* Indicator (partial arc, spinning) */}
        <svg
          className={`absolute inset-0 animate-spin ${sizeMap[size]} ${indicator}`}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
