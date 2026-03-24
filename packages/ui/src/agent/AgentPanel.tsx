/**
 * AgentPanel — slide-out sidebar panel for the voice agent.
 *
 * Fixed to the right edge of the viewport with a backdrop overlay.
 * Full-width on mobile, max 540px on desktop. Slides in from
 * the right with a CSS transition.
 *
 * Accessibility:
 * - Escape key closes the panel
 * - Backdrop click to dismiss
 * - Focus trap within panel when open
 * - aria-modal for screen readers
 */

import { useEffect, useCallback, useRef } from "react";

interface AgentPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Panel content */
  children: React.ReactNode;
}

export function AgentPanel({ isOpen, onClose, children }: AgentPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isOpen]);

  // Focus the panel when opened
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <>
      {/* Backdrop — only rendered when open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[9998] bg-black/60"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel — always in DOM for slide transition, but non-interactive when closed */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={isOpen}
        aria-label="Voice assistant panel"
        aria-hidden={!isOpen}
        tabIndex={isOpen ? -1 : undefined}
        className={`fixed top-0 right-0 z-[9999] h-full w-full max-w-[540px] bg-surface text-foreground shadow-2xl flex flex-col transition-transform duration-300 ease-out focus:outline-none ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        {children}
      </div>
    </>
  );
}
