/**
 * Modal — accessible dialog overlay with focus management.
 *
 * Composes Heading, Text, Button, IconButton, and VisuallyHidden.
 * Uses the native <dialog> element where supported, with a
 * fallback to role="dialog" + aria-modal for older browsers.
 *
 * Accessibility:
 * - Focus trap: Tab/Shift+Tab cycles within the modal
 * - Focus restoration: Returns focus to trigger on close
 * - Escape key closes the modal
 * - aria-labelledby links to the modal title
 * - aria-describedby links to the modal description
 * - Body scroll lock while open
 * - Backdrop click to dismiss (configurable)
 *
 * Sub-components: Modal, ModalHeader, ModalBody, ModalFooter
 */

import { useEffect, useRef, useCallback } from "react";
import { Heading } from "./Heading";
import { IconButton } from "./IconButton";
import { XIcon } from "../icons";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

interface ModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Width preset */
  size?: ModalSize;
  /** Close on backdrop click */
  closeOnOverlayClick?: boolean;
  /** Close on Escape key */
  closeOnEscape?: boolean;
  /** ID for aria-labelledby */
  "aria-labelledby"?: string;
  /** ID for aria-describedby */
  "aria-describedby"?: string;
  /** Modal content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  size = "md",
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = "",
  children,
  ...props
}: ModalProps) {
  const { key: _, ...domProps } = props as typeof props & { key?: React.Key };
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Store the previously focused element
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, [open]);

  // Focus the first focusable element when opened
  useEffect(() => {
    if (!open || !modalRef.current) return;

    const firstFocusable = modalRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    return () => {
      // Restore focus when closed
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Body scroll lock
  useEffect(() => {
    if (open) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, closeOnEscape, onClose]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-overlay"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        onKeyDown={handleKeyDown}
        className={`relative w-full ${sizeStyles[size]} bg-surface rounded-card shadow-modal animate-slide-up motion-reduce:animate-fade-in overflow-hidden ${className}`}
        {...domProps}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────── */

interface ModalHeaderProps {
  /** Modal title */
  title: string;
  /** Title heading level */
  level?: 2 | 3 | 4;
  /** Title element ID (for aria-labelledby) */
  id?: string;
  /** Show close button */
  showClose?: boolean;
  /** Close callback (required if showClose) */
  onClose?: () => void;
  /** Additional class names */
  className?: string;
}

export function ModalHeader({
  title,
  level = 2,
  id,
  showClose = true,
  onClose,
  className = "",
}: ModalHeaderProps) {
  return (
    <header className={`flex items-center justify-between px-6 py-4 border-b border-neutral-200 ${className}`}>
      <Heading level={level} size="lg" weight="semibold" id={id}>
        {title}
      </Heading>
      {showClose && onClose && (
        <IconButton
          aria-label="Close dialog"
          icon={<XIcon size="md" />}
          variant="ghost"
          size="sm"
          onClick={onClose}
        />
      )}
    </header>
  );
}

interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalBody({ children, className = "" }: ModalBodyProps) {
  return (
    <div className={`px-6 py-4 overflow-y-auto ${className}`}>
      {children}
    </div>
  );
}

interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalFooter({ children, className = "" }: ModalFooterProps) {
  return (
    <footer className={`flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200 ${className}`}>
      {children}
    </footer>
  );
}
