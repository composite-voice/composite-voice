/**
 * Alert — status notification component with semantic ARIA roles.
 *
 * Composes Icon, Heading, Text, and IconButton. Uses role="alert"
 * for urgent messages (danger/warning) and role="status" for
 * informational messages, ensuring screen readers announce them
 * appropriately. Supports dismissible alerts with close button.
 *
 * Schema.org: n/a (alerts are UI state, not structured content).
 */

import { useState } from "react";
import { Heading } from "./Heading";
import { Text } from "./Text";
import { IconButton } from "./IconButton";
import {
  InfoIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  XIcon,
} from "../icons";

type AlertVariant = "info" | "success" | "warning" | "danger";

interface AlertProps {
  /** Severity variant determines color and default icon */
  variant?: AlertVariant;
  /** Optional heading above the message */
  title?: string;
  /** Alert message content */
  children: React.ReactNode;
  /** Show close button */
  dismissible?: boolean;
  /** Callback when dismissed */
  onDismiss?: () => void;
  /** Override default variant icon */
  icon?: React.ReactNode;
  /** Hide the icon */
  hideIcon?: boolean;
  /** Additional class names */
  className?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  info: "bg-info-50 border-info-200 text-info-800",
  success: "bg-success-50 border-success-200 text-success-800",
  warning: "bg-warning-50 border-warning-200 text-warning-800",
  danger: "bg-danger-50 border-danger-200 text-danger-800",
};

const variantIconColor: Record<AlertVariant, string> = {
  info: "text-info-600",
  success: "text-success-600",
  warning: "text-warning-600",
  danger: "text-danger-600",
};

const defaultIcons: Record<AlertVariant, React.ReactNode> = {
  info: <InfoIcon size="md" />,
  success: <CheckCircleIcon size="md" />,
  warning: <AlertTriangleIcon size="md" />,
  danger: <AlertCircleIcon size="md" />,
};

export function Alert({
  variant = "info",
  title,
  children,
  dismissible = false,
  onDismiss,
  icon,
  hideIcon = false,
  className = "",
}: AlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  // Use role="alert" for urgent (danger/warning), "status" for informational
  const role = variant === "danger" || variant === "warning" ? "alert" : "status";
  const resolvedIcon = icon ?? defaultIcons[variant];

  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={`flex gap-3 rounded-lg border p-4 ${variantStyles[variant]} ${className}`}
    >
      {!hideIcon && (
        <span className={`shrink-0 mt-0.5 ${variantIconColor[variant]}`} aria-hidden="true">
          {resolvedIcon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        {title && (
          <Heading level={4} size="sm" weight="semibold" color="inherit" className="mb-1">
            {title}
          </Heading>
        )}
        <Text as="span" size="sm" color="inherit" weight="normal">
          {children}
        </Text>
      </div>
      {dismissible && (
        <IconButton
          aria-label="Dismiss alert"
          icon={<XIcon size="sm" />}
          variant="ghost"
          size="xs"
          className="shrink-0 -mt-1 -mr-1 text-inherit opacity-70 hover:opacity-100"
          onClick={handleDismiss}
        />
      )}
    </div>
  );
}
