/**
 * Banner — full-width notification bar.
 *
 * Composes Icon, Text, Button, and IconButton for a complete
 * notification pattern. Suitable for announcements, system status,
 * and promotional messages.
 *
 * Accessibility:
 * - role="banner" for site-level announcements
 * - role="status" or role="alert" depending on urgency
 * - Dismissible banners announce removal to screen readers
 *
 * Semantic placement: Typically placed at the top of the page
 * or viewport for maximum visibility.
 */

import { useState } from "react";
import { Text } from "./Text";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import {
  InfoIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  XIcon,
} from "../icons";

type BannerVariant = "info" | "success" | "warning" | "danger" | "neutral";

interface BannerAction {
  label: string;
  onClick: () => void;
}

interface BannerProps {
  /** Severity variant */
  variant?: BannerVariant;
  /** Allow user to dismiss */
  dismissible?: boolean;
  /** Dismiss callback */
  onDismiss?: () => void;
  /** Override default icon */
  icon?: React.ReactNode;
  /** Optional action button */
  action?: BannerAction;
  /** Stick to viewport top */
  sticky?: boolean;
  /** Banner message */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

const variantStyles: Record<BannerVariant, string> = {
  info: "bg-info-600 text-on-filled",
  success: "bg-success-600 text-on-filled",
  warning: "bg-warning-600 text-on-filled",
  danger: "bg-danger-600 text-on-filled",
  neutral: "bg-neutral-800 text-on-filled",
};

const actionVariants: Record<BannerVariant, "ghost" | "outline"> = {
  info: "ghost",
  success: "ghost",
  warning: "ghost",
  danger: "ghost",
  neutral: "ghost",
};

const defaultIcons: Record<BannerVariant, React.ReactNode> = {
  info: <InfoIcon size="md" />,
  success: <CheckCircleIcon size="md" />,
  warning: <AlertTriangleIcon size="md" />,
  danger: <AlertCircleIcon size="md" />,
  neutral: <InfoIcon size="md" />,
};

export function Banner({
  variant = "info",
  dismissible = false,
  onDismiss,
  icon,
  action,
  sticky = false,
  className = "",
  children,
}: BannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const role = variant === "danger" || variant === "warning" ? "alert" : "status";
  const resolvedIcon = icon ?? defaultIcons[variant];

  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={`w-full shadow-banner ${variantStyles[variant]} ${sticky ? "sticky top-0 z-40" : ""} ${className}`}
    >
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 opacity-90" aria-hidden="true">
              {resolvedIcon}
            </span>
            <Text as="p" size="sm" weight="medium" color="inherit" className="min-w-0">
              {children}
            </Text>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {action && (
              <Button
                variant={actionVariants[variant]}
                size="xs"
                onClick={action.onClick}
                className="text-inherit border-current/30 hover:bg-on-filled/10"
              >
                {action.label}
              </Button>
            )}
            {dismissible && (
              <IconButton
                aria-label="Dismiss banner"
                icon={<XIcon size="sm" />}
                variant="ghost"
                size="xs"
                onClick={handleDismiss}
                className="text-inherit opacity-70 hover:opacity-100 hover:bg-on-filled/10"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
