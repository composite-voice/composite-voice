/**
 * IconButton — icon-only button with required accessible label.
 *
 * Composes Button and VisuallyHidden. The aria-label is mandatory
 * because icon-only buttons have no visible text — screen readers
 * need the label to convey the button's purpose.
 */

import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import { VisuallyHidden } from "./VisuallyHidden";

interface IconButtonProps
  extends Omit<ButtonProps, "leftIcon" | "rightIcon" | "children" | "as"> {
  /** Required accessible label for screen readers */
  "aria-label": string;
  /** The icon to display */
  icon: React.ReactNode;
}

const sizeMap = {
  xs: "!p-1",
  sm: "!p-1.5",
  md: "!p-2",
  lg: "!p-2.5",
  xl: "!p-3",
};

export function IconButton({
  icon,
  "aria-label": ariaLabel,
  size = "md",
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <Button
      size={size}
      className={`${sizeMap[size]} ${className}`}
      aria-label={ariaLabel}
      {...props}
    >
      <span aria-hidden="true">{icon}</span>
      <VisuallyHidden>{ariaLabel}</VisuallyHidden>
    </Button>
  );
}
