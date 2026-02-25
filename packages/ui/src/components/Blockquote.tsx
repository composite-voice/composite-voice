/**
 * Blockquote — styled block quotation.
 *
 * Renders a semantic <blockquote> with a left border accent
 * and optional citation. Uses design tokens for all colors.
 *
 * Accessibility:
 * - Semantic <blockquote> and <cite> elements
 * - Proper color contrast in both light and dark modes
 * - Schema.org Quotation markup
 */

interface BlockquoteProps {
  /** Quote content */
  children: React.ReactNode;
  /** Attribution / citation source */
  cite?: string;
  /** Citation URL */
  citeUrl?: string;
  /** Visual variant */
  variant?: "default" | "accent" | "subtle";
  /** Additional class names */
  className?: string;
}

const variantStyles = {
  default: "border-primary-300 bg-primary-50/50",
  accent: "border-accent-300 bg-accent-50/50",
  subtle: "border-neutral-300 bg-surface-sunken",
};

export function Blockquote({
  children,
  cite,
  citeUrl,
  variant = "default",
  className = "",
}: BlockquoteProps) {
  return (
    <blockquote
      className={`border-l-4 pl-4 py-3 ${variantStyles[variant]} rounded-r-md ${className}`}
      itemScope
      itemType="https://schema.org/Quotation"
    >
      <div className="text-neutral-700 italic leading-relaxed" itemProp="text">
        {children}
      </div>
      {cite && (
        <footer className="mt-2 text-sm text-foreground-muted not-italic">
          {"— "}
          {citeUrl ? (
            <a
              href={citeUrl}
              className="underline hover:text-primary-600 transition-colors"
              itemProp="creator"
              rel="noopener noreferrer"
            >
              {cite}
            </a>
          ) : (
            <span itemProp="creator">{cite}</span>
          )}
        </footer>
      )}
    </blockquote>
  );
}
