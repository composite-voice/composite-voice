/**
 * Label — form field label with required indicator.
 *
 * Composes Text for the label content. Associates with form controls
 * via the `htmlFor` prop (critical for accessibility — clicking the
 * label focuses the input, and screen readers announce the relationship).
 */

import { Text } from "./Text";

type LabelSize = "sm" | "md" | "lg";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Show required asterisk */
  required?: boolean;
  /** Visually mute when associated control is disabled */
  disabled?: boolean;
  /** Label size */
  size?: LabelSize;
  /** Label content */
  children: React.ReactNode;
}

const sizeMap: Record<LabelSize, "xs" | "sm" | "base"> = {
  sm: "xs",
  md: "sm",
  lg: "base",
};

export function Label({
  required = false,
  disabled = false,
  size = "md",
  className = "",
  children,
  ...props
}: LabelProps) {
  const { key: _, ...domProps } = props as typeof props & { key?: React.Key };
  return (
    <label
      className={`inline-flex items-center gap-1 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
      {...domProps}
    >
      <Text as="span" size={sizeMap[size]} weight="medium" color={disabled ? "muted" : "default"}>
        {children}
      </Text>
      {required && (
        <span className="text-danger-500 text-sm" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}
