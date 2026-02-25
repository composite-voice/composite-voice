/**
 * Select — dropdown select input with custom chevron icon.
 *
 * Composes Icon (ChevronDown) for the dropdown indicator.
 * Uses native <select> for maximum accessibility — native selects
 * work correctly with screen readers, keyboard navigation, and
 * mobile devices without additional ARIA engineering.
 */

import { ChevronDownIcon } from "../icons";

type SelectSize = "sm" | "md" | "lg";
type SelectVariant = "default" | "filled";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Visual style */
  variant?: SelectVariant;
  /** Size preset */
  selectSize?: SelectSize;
  /** Error state */
  error?: boolean;
  /** Option list */
  options: SelectOption[];
  /** Placeholder option text (not selectable) */
  placeholder?: string;
}

const variantStyles: Record<SelectVariant, string> = {
  default: "bg-surface border-neutral-300",
  filled: "bg-neutral-50 border-transparent",
};

const sizeStyles: Record<SelectSize, string> = {
  sm: "text-sm py-1.5 pl-3 pr-8",
  md: "text-sm py-2 pl-3 pr-10",
  lg: "text-base py-2.5 pl-4 pr-11",
};

export function Select({
  variant = "default",
  selectSize = "md",
  error = false,
  options,
  placeholder,
  className = "",
  disabled,
  ...props
}: SelectProps) {
  const borderColor = error
    ? "border-danger-500 focus:ring-danger-500"
    : `${variantStyles[variant]} focus:border-primary-500 focus:ring-primary-500`;

  const classes = [
    "block w-full rounded-input border appearance-none transition-colors duration-150",
    "focus:outline-none focus:ring-2 focus:ring-offset-0",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-50",
    borderColor,
    sizeStyles[selectSize],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="relative">
      <select
        className={classes}
        disabled={disabled}
        aria-invalid={error || undefined}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-neutral-400 pointer-events-none"
        aria-hidden="true"
      >
        <ChevronDownIcon size="sm" />
      </span>
    </div>
  );
}
