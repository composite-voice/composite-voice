/**
 * Kbd — keyboard shortcut indicator.
 *
 * Renders a styled <kbd> element for displaying keyboard keys
 * and shortcuts. Mimics a physical key appearance.
 *
 * Accessibility:
 * - Semantic <kbd> element recognized by assistive technology
 * - Sufficient contrast for readability
 */

interface KbdProps {
  /** Key label(s) */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function Kbd({ children, className = "" }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center px-1.5 py-0.5 text-[0.8em] font-mono font-medium text-neutral-700 bg-surface border border-neutral-300 rounded shadow-[0_1px_0_1px_var(--color-neutral-200)] ${className}`}
    >
      {children}
    </kbd>
  );
}
