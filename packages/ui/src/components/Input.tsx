/**
 * Input — text input with addon slots and validation states.
 *
 * Composes Icon for addon decorations. Supports left/right addons
 * for search icons, units, buttons, etc. Error state changes the
 * border color and focus ring to danger tokens.
 *
 * Accessibility:
 * - aria-invalid signals error state to screen readers
 * - aria-describedby links to help/error text (set by FormField)
 * - Native <input> element preserves all built-in behaviors
 */

type InputSize = "sm" | "md" | "lg";
type InputVariant = "default" | "filled";

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Visual style */
  variant?: InputVariant;
  /** Size preset */
  inputSize?: InputSize;
  /** Error state */
  error?: boolean;
  /** Left addon (icon, text, or element) */
  leftAddon?: React.ReactNode;
  /** Right addon (icon, text, or element) */
  rightAddon?: React.ReactNode;
  /** Additional class names for the wrapper */
  wrapperClassName?: string;
}

const variantStyles: Record<InputVariant, string> = {
  default: "bg-surface border-neutral-300",
  filled: "bg-neutral-50 border-transparent",
};

const sizeStyles: Record<InputSize, string> = {
  sm: "text-sm py-1.5 px-3",
  md: "text-sm py-2 px-3",
  lg: "text-base py-2.5 px-4",
};

const addonPadding: Record<InputSize, { left: string; right: string }> = {
  sm: { left: "pl-8", right: "pr-8" },
  md: { left: "pl-10", right: "pr-10" },
  lg: { left: "pl-11", right: "pr-11" },
};

const addonPositionSize: Record<InputSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-5 h-5",
};

export function Input({
  variant = "default",
  inputSize = "md",
  error = false,
  leftAddon,
  rightAddon,
  wrapperClassName = "",
  className = "",
  disabled,
  ...props
}: InputProps) {
  const { key: _, ...domProps } = props as typeof props & { key?: React.Key };
  const borderColor = error
    ? "border-danger-500 focus:ring-danger-500"
    : `${variantStyles[variant]} focus:border-primary-500 focus:ring-primary-500`;

  const inputClasses = [
    "block w-full rounded-input border transition-colors duration-150",
    "placeholder:text-neutral-400",
    "focus:outline-none focus:ring-2 focus:ring-offset-0",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-50",
    borderColor,
    sizeStyles[inputSize],
    leftAddon ? addonPadding[inputSize].left : "",
    rightAddon ? addonPadding[inputSize].right : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`relative ${wrapperClassName}`}>
      {leftAddon && (
        <span
          className={`absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400 pointer-events-none ${addonPositionSize[inputSize]}`}
          aria-hidden="true"
          style={{ width: "auto", height: "auto" }}
        >
          <span className={addonPositionSize[inputSize]}>{leftAddon}</span>
        </span>
      )}
      <input
        className={inputClasses}
        disabled={disabled}
        aria-invalid={error || undefined}
        {...domProps}
      />
      {rightAddon && (
        <span
          className={`absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 pointer-events-none`}
          aria-hidden="true"
        >
          <span className={addonPositionSize[inputSize]}>{rightAddon}</span>
        </span>
      )}
    </div>
  );
}
