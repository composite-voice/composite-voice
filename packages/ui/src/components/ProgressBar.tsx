/**
 * ProgressBar — accessible progress indicator.
 *
 * Composes Text for the optional value label and VisuallyHidden
 * for screen reader progress announcements. Uses native
 * role="progressbar" with aria-valuenow/min/max for AT support.
 *
 * Supports determinate (value-based) and indeterminate (animated)
 * modes. The indeterminate mode uses a CSS animation for the bar.
 */

import { Text } from "./Text";
import { VisuallyHidden } from "./VisuallyHidden";

type ProgressSize = "xs" | "sm" | "md" | "lg";
type ProgressColor = "primary" | "success" | "warning" | "danger" | "info" | "accent";

interface ProgressBarProps {
  /** Current value (0–max) */
  value?: number;
  /** Maximum value */
  max?: number;
  /** Track height */
  size?: ProgressSize;
  /** Bar color */
  color?: ProgressColor;
  /** Accessible label */
  label?: string;
  /** Show percentage text */
  showValue?: boolean;
  /** Indeterminate (unknown progress) */
  indeterminate?: boolean;
  /** Additional class names */
  className?: string;
}

const sizeStyles: Record<ProgressSize, string> = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

const colorStyles: Record<ProgressColor, string> = {
  primary: "bg-primary-600",
  success: "bg-success-600",
  warning: "bg-warning-500",
  danger: "bg-danger-600",
  info: "bg-info-500",
  accent: "bg-accent-600",
};

export function ProgressBar({
  value = 0,
  max = 100,
  size = "md",
  color = "primary",
  label,
  showValue = false,
  indeterminate = false,
  className = "",
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const displayLabel = label || `Progress: ${Math.round(percentage)}%`;

  return (
    <div className={`w-full ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <Text as="span" size="sm" weight="medium" color="default">
              {label}
            </Text>
          )}
          {showValue && !indeterminate && (
            <Text as="span" size="sm" color="muted">
              {Math.round(percentage)}%
            </Text>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={displayLabel}
        aria-busy={indeterminate || undefined}
        className={`w-full bg-neutral-200 rounded-full overflow-hidden ${sizeStyles[size]}`}
      >
        {indeterminate ? (
          <div
            className={`h-full w-1/3 rounded-full ${colorStyles[color]} animate-[progress-indeterminate_1.5s_ease-in-out_infinite]`}
            style={{
              animation: "progress-indeterminate 1.5s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${colorStyles[color]}`}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
      <VisuallyHidden>{displayLabel}</VisuallyHidden>
    </div>
  );
}
