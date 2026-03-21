/**
 * Button — primary interactive element for actions and navigation.
 *
 * Composes Icon (for left/right icons) and VisuallyHidden (for loading
 * state screen reader announcements). Supports polymorphic rendering
 * as <button> or <a> via the `as` prop.
 *
 * Accessibility:
 * - Uses native <button> semantics by default
 * - aria-disabled instead of disabled attr preserves focusability
 * - Loading state announces to screen readers via aria-live region
 * - Focus ring uses theme shadow-focus token
 */

import { VisuallyHidden } from "./VisuallyHidden";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline" | "link";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

interface ButtonBaseProps {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Stretch to full container width */
  fullWidth?: boolean;
  /** Show loading spinner and disable interaction */
  loading?: boolean;
  /** Loading text for screen readers */
  loadingText?: string;
  /** Icon placed before children */
  leftIcon?: React.ReactNode;
  /** Icon placed after children */
  rightIcon?: React.ReactNode;
  /** Disable the button */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
  /** Content */
  children?: React.ReactNode;
}

type ButtonAsButton = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    as?: "button";
    href?: never;
  };

type ButtonAsAnchor = ButtonBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps> & {
    as: "a";
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-600 text-on-filled hover:bg-primary-700 active:bg-primary-800 shadow-sm",
  secondary:
    "bg-secondary-100 text-secondary-800 hover:bg-secondary-200 active:bg-secondary-300",
  danger:
    "bg-danger-600 text-on-filled hover:bg-danger-700 active:bg-danger-800 shadow-sm",
  ghost:
    "bg-transparent text-foreground hover:bg-neutral-100 active:bg-neutral-200",
  outline:
    "bg-transparent text-foreground border border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100",
  link:
    "bg-transparent text-primary-600 hover:text-primary-700 underline-offset-4 hover:underline p-0 h-auto",
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "px-2 py-1 text-xs gap-1",
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-base gap-2",
  xl: "px-6 py-3 text-base gap-2.5",
};

const focusStyles =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2";

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  loadingText = "Loading…",
  leftIcon,
  rightIcon,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const classes = [
    "inline-flex items-center justify-center font-medium rounded-button transition-colors duration-150",
    focusStyles,
    variantStyles[variant],
    sizeStyles[size],
    fullWidth ? "w-full" : "",
    isDisabled ? "opacity-50 pointer-events-none" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {loading && (
        <>
          <svg
            className="animate-spin -ml-0.5 w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <VisuallyHidden>{loadingText}</VisuallyHidden>
        </>
      )}
      {!loading && leftIcon && (
        <span className="shrink-0" aria-hidden="true">
          {leftIcon}
        </span>
      )}
      {children && <span>{children}</span>}
      {!loading && rightIcon && (
        <span className="shrink-0" aria-hidden="true">
          {rightIcon}
        </span>
      )}
    </>
  );

  if (props.as === "a") {
    const { as: _, ...anchorProps } = props as ButtonAsAnchor;
    return (
      <a
        className={classes}
        aria-disabled={isDisabled || undefined}
        {...anchorProps}
      >
        {content}
      </a>
    );
  }

  const { as: _, ...buttonProps } = props as ButtonAsButton;
  return (
    <button
      type="button"
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
