/**
 * Textarea — multiline text input with resize control.
 *
 * Follows the same pattern as Input for variant/size/error styling.
 * Supports controlled resize behavior via CSS resize property.
 *
 * Accessibility:
 * - aria-invalid for error state
 * - aria-describedby linkage (set by FormField wrapper)
 */

type TextareaSize = "sm" | "md" | "lg";
type TextareaVariant = "default" | "filled";
type TextareaResize = "none" | "vertical" | "horizontal" | "both";

interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  /** Visual style */
  variant?: TextareaVariant;
  /** Size preset */
  textareaSize?: TextareaSize;
  /** Error state */
  error?: boolean;
  /** Resize behavior */
  resize?: TextareaResize;
}

const variantStyles: Record<TextareaVariant, string> = {
  default: "bg-surface border-neutral-300",
  filled: "bg-neutral-50 border-transparent",
};

const sizeStyles: Record<TextareaSize, string> = {
  sm: "text-sm py-1.5 px-3 min-h-[4.5rem]",
  md: "text-sm py-2 px-3 min-h-[6rem]",
  lg: "text-base py-2.5 px-4 min-h-[8rem]",
};

const resizeMap: Record<TextareaResize, string> = {
  none: "resize-none",
  vertical: "resize-y",
  horizontal: "resize-x",
  both: "resize",
};

export function Textarea({
  variant = "default",
  textareaSize = "md",
  error = false,
  resize = "vertical",
  className = "",
  disabled,
  ...props
}: TextareaProps) {
  const { key: _, ...domProps } = props as typeof props & { key?: React.Key };
  const borderColor = error
    ? "border-danger-500 focus:ring-danger-500"
    : `${variantStyles[variant]} focus:border-primary-500 focus:ring-primary-500`;

  const classes = [
    "block w-full rounded-input border transition-colors duration-150",
    "placeholder:text-neutral-400",
    "focus:outline-none focus:ring-2 focus:ring-offset-0",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-50",
    borderColor,
    sizeStyles[textareaSize],
    resizeMap[resize],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <textarea
      className={classes}
      disabled={disabled}
      aria-invalid={error || undefined}
      {...domProps}
    />
  );
}
