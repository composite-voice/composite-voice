/**
 * BrandName — renders the CompositeVoice brand with the primary accent.
 *
 * The base portion ("Composite" / "C") inherits the parent's text color.
 * The accent portion ("Voice" / "V") is always rendered in primary-600.
 *
 * Variants:
 * - `wordmark` (default): "CompositeVoice"
 * - `lettermark`: "CV"
 */

export interface BrandNameProps {
  /** Display variant */
  variant?: "wordmark" | "lettermark";
  /** Additional class names on the wrapper span */
  className?: string;
}

export function BrandName({
  variant = "wordmark",
  className,
}: BrandNameProps) {
  if (variant === "lettermark") {
    return (
      <span className={className}>
        C<span className="text-primary-600">V</span>
      </span>
    );
  }

  return (
    <span className={className}>
      Composite<span className="text-primary-600">Voice</span>
    </span>
  );
}
