/**
 * NavbarSearch — cmd+K search dialog powered by Pagefind.
 *
 * Renders a compact trigger button in the navbar. On click (or ⌘K / Ctrl+K),
 * opens a modal dialog and dynamically loads PagefindUI from the build output.
 * Falls back gracefully in dev mode if pagefind hasn't been built yet.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { SearchIcon } from "../icons";

interface NavbarSearchProps {
  /** Base URL path for pagefind assets (e.g. "/docs") */
  basePath?: string;
}

/** Load a script tag and resolve when it's ready. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already loaded?
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export function NavbarSearch({ basePath = "" }: NavbarSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiRef = useRef<unknown>(null);
  const cssLoadedRef = useRef(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Load pagefind-ui.css once
  useEffect(() => {
    if (cssLoadedRef.current) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${basePath}/pagefind/pagefind-ui.css`;
    document.head.appendChild(link);
    cssLoadedRef.current = true;
  }, [basePath]);

  // Initialize PagefindUI when dialog opens
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    let cancelled = false;

    async function init() {
      try {
        // pagefind-ui.js is an IIFE that sets window.PagefindUI —
        // load it via script tag, not import() which requires ES modules
        await loadScript(`${basePath}/pagefind/pagefind-ui.js`);
        if (cancelled || !containerRef.current) return;

        const PagefindUI = (window as Record<string, unknown>).PagefindUI as
          | (new (opts: Record<string, unknown>) => unknown)
          | undefined;

        if (!PagefindUI) throw new Error("PagefindUI not found on window");

        if (!uiRef.current) {
          uiRef.current = new PagefindUI({
            element: containerRef.current,
            showImages: false,
            showSubResults: true,
          });
        }

        // Focus the search input
        requestAnimationFrame(() => {
          containerRef.current
            ?.querySelector<HTMLInputElement>("input")
            ?.focus();
        });
      } catch {
        // Pagefind not available (e.g. dev mode before first build)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML =
            '<p class="px-4 py-8 text-sm text-center text-foreground-muted">Search is available after building the site.</p>';
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [isOpen, basePath]);

  // Destroy PagefindUI on close to reset state
  useEffect(() => {
    if (isOpen) return;
    const ui = uiRef.current as { destroy?: () => void } | null;
    if (ui) {
      ui.destroy?.();
      uiRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    }
  }, [isOpen]);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={open}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-foreground-muted bg-surface-sunken border border-neutral-200 hover:border-neutral-300 hover:text-foreground transition-colors cursor-text"
        aria-label="Search documentation"
      >
        <SearchIcon size="sm" />
        <span className="hidden sm:inline text-foreground-muted">
          Search docs...
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-auto px-1.5 py-0.5 rounded border border-neutral-200 bg-surface text-[10px] font-mono text-foreground-muted leading-none">
          {isMac ? "⌘" : "Ctrl+"}K
        </kbd>
      </button>

      {/* Modal overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Search documentation"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Search panel */}
          <div
            className="pagefind-search-modal relative w-full max-w-2xl bg-surface rounded-xl shadow-2xl border border-neutral-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div ref={containerRef} />
          </div>
        </div>
      )}
    </>
  );
}
