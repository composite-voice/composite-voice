/**
 * Badge — inline status indicator or label.
 *
 * Composes Text for content rendering and IconButton for the
 * removable variant. Supports dot indicators for compact status
 * display (e.g., online/offline).
 *
 * Accessibility: Uses appropriate color contrast ratios and
 * screen-reader-friendly removal interaction.
 */

import { Text } from "./Text";
import { XIcon } from "../icons";

type BadgeVariant =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";

type BadgeSize = "sm" | "md" | "lg";

interface BadgeProps {
  /** Color variant */
  variant?: BadgeVariant;
  /** Size preset */
  size?: BadgeSize;
  /** Show a status dot before the text */
  dot?: boolean;
  /** Show remove button */
  removable?: boolean;
  /** Callback when remove is clicked */
  onRemove?: () => void;
  /** Badge content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-neutral-100 text-neutral-700",
  primary: "bg-primary-100 text-primary-700",
  secondary: "bg-secondary-100 text-secondary-700",
  success: "bg-success-100 text-success-700",
  warning: "bg-warning-100 text-warning-700",
  danger: "bg-danger-100 text-danger-700",
  info: "bg-info-100 text-info-700",
  outline: "bg-transparent text-neutral-600 border border-neutral-300",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-neutral-400",
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
  info: "bg-info-500",
  outline: "bg-neutral-400",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-0.5 text-xs",
  lg: "px-2.5 py-1 text-sm",
};

const dotSizes: Record<BadgeSize, string> = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2 h-2",
};

export function Badge({
  variant = "default",
  size = "md",
  dot = false,
  removable = false,
  onRemove,
  className = "",
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-badge whitespace-nowrap ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {dot && (
        <span
          className={`shrink-0 rounded-full ${dotColors[variant]} ${dotSizes[size]}`}
          aria-hidden="true"
        />
      )}
      <Text as="span" size="xs" color="inherit" weight="medium">
        {children}
      </Text>
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 -mr-0.5 ml-0.5 rounded-full p-0.5 hover:bg-neutral-950/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current transition-colors"
          aria-label={`Remove ${typeof children === "string" ? children : "badge"}`}
        >
          <XIcon size="xs" />
        </button>
      )}
    </span>
  );
}
