/**
 * Checkbox — accessible checkbox with label and description.
 *
 * Composes Label, Text, and VisuallyHidden. Uses a visually hidden
 * native <input type="checkbox"> overlaid with a styled indicator,
 * preserving full keyboard and screen reader accessibility.
 *
 * Supports indeterminate state via ref-based DOM property assignment
 * (the indeterminate state cannot be set via HTML attribute).
 */

import { useRef, useEffect } from "react";
import { Text } from "./Text";
import { CheckIcon, MinusIcon } from "../icons";

type CheckboxSize = "sm" | "md" | "lg";

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Visible label text */
  label?: string;
  /** Help text below the label */
  description?: string;
  /** Size preset */
  size?: CheckboxSize;
  /** Error state */
  error?: boolean;
  /** Indeterminate state (partially checked) */
  indeterminate?: boolean;
}

const sizeMap: Record<CheckboxSize, { box: string; icon: "xs" | "sm" | "md"; text: "xs" | "sm" | "base" }> = {
  sm: { box: "w-4 h-4", icon: "xs", text: "sm" },
  md: { box: "w-5 h-5", icon: "sm", text: "base" },
  lg: { box: "w-6 h-6", icon: "md", text: "base" },
};

export function Checkbox({
  label,
  description,
  size = "md",
  error = false,
  indeterminate = false,
  className = "",
  disabled,
  checked,
  id,
  ...props
}: CheckboxProps) {
  const { key: _, ...domProps } = props as typeof props & { key?: React.Key };
  const inputRef = useRef<HTMLInputElement>(null);
  const sizes = sizeMap[size];

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const borderColor = error
    ? "border-danger-500"
    : "border-neutral-300 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2";

  return (
    <label
      className={`inline-flex items-start gap-2 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      <span className="relative flex items-center justify-center shrink-0 mt-0.5">
        <input
          ref={inputRef}
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          aria-invalid={error || undefined}
          className="peer absolute w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          {...domProps}
        />
        <span
          className={`${sizes.box} rounded border transition-colors duration-150 flex items-center justify-center ${borderColor} peer-checked:bg-primary-600 peer-checked:border-primary-600 peer-indeterminate:bg-primary-600 peer-indeterminate:border-primary-600`}
          aria-hidden="true"
        >
          {(checked || indeterminate) && (
            <span className="text-on-filled">
              {indeterminate ? <MinusIcon size={sizes.icon} /> : <CheckIcon size={sizes.icon} />}
            </span>
          )}
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
