/**
 * ButtonGroup — groups related buttons with consistent spacing.
 *
 * Uses role="group" with an accessible label so screen readers
 * announce the button collection as a related set.
 */

interface ButtonGroupProps {
  /** Grouped button children */
  children: React.ReactNode;
  /** Layout direction */
  orientation?: "horizontal" | "vertical";
  /** Gap between buttons */
  spacing?: "none" | "sm" | "md";
  /** Accessible group label */
  "aria-label"?: string;
  /** Additional class names */
  className?: string;
}

const spacingMap = {
  none: "gap-0 [&>*:not(:first-child)]:-ml-px",
  sm: "gap-1",
  md: "gap-2",
};

const orientationMap = {
  horizontal: "flex-row",
  vertical: "flex-col",
};

export function ButtonGroup({
  children,
  orientation = "horizontal",
  spacing = "md",
  className = "",
  ...props
}: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={`inline-flex ${orientationMap[orientation]} ${spacingMap[spacing]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
