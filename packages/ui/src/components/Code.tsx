/**
 * Code — inline code snippet.
 *
 * Renders a styled <code> element for inline code within prose.
 * Uses design tokens for background, text color, and border radius.
 *
 * Accessibility:
 * - Semantic <code> element for assistive technology
 * - Sufficient contrast in both light and dark modes
 */

interface CodeProps {
  children: React.ReactNode;
  className?: string;
}

export function Code({ children, className = "" }: CodeProps) {
  return (
    <code
      className={`bg-surface-sunken text-danger-600 px-1.5 py-0.5 rounded text-[0.875em] font-mono border border-neutral-200 ${className}`}
    >
      {children}
    </code>
  );
}
