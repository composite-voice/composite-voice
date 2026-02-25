/**
 * Mark — highlighted text.
 *
 * Renders a styled <mark> element for drawing attention
 * to specific text within prose content.
 *
 * Accessibility:
 * - Semantic <mark> element — screen readers may announce "highlight"
 * - Sufficient contrast against the highlight background
 */

interface MarkProps {
  /** Text to highlight */
  children: React.ReactNode;
  /** Highlight color variant */
  variant?: "default" | "success" | "warning" | "info";
  /** Additional class names */
  className?: string;
}

const variantStyles = {
  default: "bg-warning-100 text-warning-900",
  success: "bg-success-100 text-success-900",
  warning: "bg-warning-100 text-warning-900",
  info: "bg-info-100 text-info-900",
};

export function Mark({
  children,
  variant = "default",
  className = "",
}: MarkProps) {
  return (
    <mark className={`px-1 py-0.5 rounded-sm ${variantStyles[variant]} ${className}`}>
      {children}
    </mark>
  );
}
