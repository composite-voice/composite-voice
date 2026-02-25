/**
 * VisuallyHidden — hides content visually while keeping it accessible
 * to screen readers and assistive technologies.
 *
 * Uses the well-established clip-rect technique recommended by WebAIM
 * and the A11y Project. Content remains in the accessibility tree but
 * is invisible and takes no layout space.
 */

interface VisuallyHiddenProps {
  /** Content accessible only to screen readers */
  children: React.ReactNode;
  /** HTML element to render */
  as?: "span" | "div" | "p";
  /** Additional class names (rarely needed) */
  className?: string;
}

export function VisuallyHidden({
  children,
  as: Element = "span",
  className = "",
}: VisuallyHiddenProps) {
  return (
    <Element
      className={`absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)] ${className}`}
    >
      {children}
    </Element>
  );
}
