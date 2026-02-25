/**
 * Icon — accessible SVG icon wrapper.
 *
 * When `label` is provided, renders with role="img" and aria-label
 * for screen readers. Without a label, sets aria-hidden="true" so
 * decorative icons don't pollute the accessibility tree.
 *
 * Accepts SVG children (path elements) rendered inside a viewBox.
 */

type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

interface IconProps extends React.SVGAttributes<SVGElement> {
  /** Icon size */
  size?: IconSize;
  /** Accessible label — sets role="img" + aria-label. Omit for decorative icons. */
  label?: string;
  /** SVG child elements (paths, circles, etc.) */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

const sizeMap: Record<IconSize, string> = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
};

export function Icon({
  size = "md",
  label,
  className = "",
  children,
  ...props
}: IconProps) {
  const accessibilityProps = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${sizeMap[size]} ${className}`}
      {...accessibilityProps}
      {...props}
    >
      {children}
    </svg>
  );
}
