/**
 * Radio — accessible radio button with label and description.
 *
 * Composes Text for label/description. Uses a visually hidden native
 * <input type="radio"> overlaid with a styled circular indicator.
 * Must be used within a group with shared `name` attribute for
 * native radio group keyboard navigation (arrow keys).
 */

import { Text } from "./Text";

type RadioSize = "sm" | "md" | "lg";

interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Visible label text */
  label?: string;
  /** Help text below the label */
  description?: string;
  /** Size preset */
  size?: RadioSize;
  /** Error state */
  error?: boolean;
}

const sizeMap: Record<RadioSize, { outer: string; inner: string; text: "xs" | "sm" | "base" }> = {
  sm: { outer: "w-4 h-4", inner: "w-1.5 h-1.5", text: "sm" },
  md: { outer: "w-5 h-5", inner: "w-2 h-2", text: "base" },
  lg: { outer: "w-6 h-6", inner: "w-2.5 h-2.5", text: "base" },
};

export function Radio({
  label,
  description,
  size = "md",
  error = false,
  className = "",
  disabled,
  ...props
}: RadioProps) {
  const { key: _, ...domProps } = props as typeof props & { key?: React.Key };
  const sizes = sizeMap[size];

  const borderColor = error
    ? "border-danger-500"
    : "border-neutral-300 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2";

  return (
    <label
      className={`inline-flex items-start gap-2 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      <span className="relative flex items-center justify-center shrink-0 mt-0.5">
        <input
          type="radio"
          disabled={disabled}
          aria-invalid={error || undefined}
          className="peer absolute w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          {...domProps}
        />
        <span
          className={`${sizes.outer} rounded-full border-2 transition-colors duration-150 flex items-center justify-center ${borderColor} peer-checked:border-primary-600`}
          aria-hidden="true"
        >
          <span
            className={`${sizes.inner} rounded-full bg-primary-600 scale-0 peer-checked:scale-100 transition-transform duration-150`}
          />
        </span>
      </span>
      {(label || description) && (
        <span className="flex flex-col">
          {label && (
            <Text as="span" size={sizes.text} weight="medium" color={disabled ? "muted" : "default"}>
              {label}
            </Text>
          )}
          {description && (
            <Text as="span" size="sm" color="muted">
              {description}
            </Text>
          )}
        </span>
      )}
    </label>
  );
}
