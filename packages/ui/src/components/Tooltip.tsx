/**
 * Tooltip — hover/focus-triggered informational overlay.
 *
 * Composes Text for tooltip content. Uses CSS-based positioning
 * relative to the trigger element (no JavaScript positioning library).
 *
 * Accessibility:
 * - role="tooltip" on the tooltip content
 * - aria-describedby links trigger to tooltip
 * - Visible on hover AND focus for keyboard users
 * - respects prefers-reduced-motion for animations
 * - Escape key dismisses the tooltip
 */

import { useState, useRef, useId, useCallback, useEffect } from "react";

type TooltipPosition = "top" | "right" | "bottom" | "left";

interface TooltipProps {
  /** Tooltip text content */
  content: React.ReactNode;
  /** Position relative to trigger */
  position?: TooltipPosition;
  /** Delay before showing (ms) */
  delay?: number;
  /** Trigger element */
  children: React.ReactElement;
  /** Additional class names for tooltip */
  className?: string;
}

const positionStyles: Record<TooltipPosition, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
};

const arrowStyles: Record<TooltipPosition, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-t-neutral-800 border-l-transparent border-r-transparent border-b-transparent",
  right: "right-full top-1/2 -translate-y-1/2 border-r-neutral-800 border-t-transparent border-b-transparent border-l-transparent",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-neutral-800 border-l-transparent border-r-transparent border-t-transparent",
  left: "left-full top-1/2 -translate-y-1/2 border-l-neutral-800 border-t-transparent border-b-transparent border-r-transparent",
};

export function Tooltip({
  content,
  position = "top",
  delay = 200,
  children,
  className = "",
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tooltipId = useId();

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [visible, hide]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {/* Clone child to add aria-describedby */}
      <span aria-describedby={visible ? tooltipId : undefined}>
        {children}
      </span>

      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 pointer-events-none ${positionStyles[position]} animate-fade-in motion-reduce:animate-none ${className}`}
        >
          <span className="block bg-neutral-800 text-on-filled rounded-tooltip shadow-tooltip px-2 py-1 text-xs font-medium leading-tight whitespace-nowrap">
            {content}
          </span>
          {/* Arrow */}
          <span
            className={`absolute w-0 h-0 border-4 ${arrowStyles[position]}`}
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
}
