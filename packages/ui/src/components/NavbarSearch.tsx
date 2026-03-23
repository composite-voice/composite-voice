/**
 * NavbarSearch — cmd+K search dialog powered by Pagefind.
 *
 * Renders a compact trigger button in the navbar. On click (or ⌘K / Ctrl+K),
 * opens a modal dialog and initializes PagefindUI. The astro-pagefind
 * integration already loads PagefindUI onto window — we just use it.
 * Falls back to script tag injection if it's not already loaded.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { SearchIcon } from "../icons";

interface NavbarSearchProps {
  /** Base URL path for pagefind assets (e.g. "/docs") */
  basePath?: string;
}

type PagefindUIConstructor = new (opts: Record<string, unknown>) => {
  destroy?: () => void;
};

/** Get PagefindUI constructor — already on window via astro-pagefind, or load via script tag. */
async function getPagefindUI(basePath: string): Promise<PagefindUIConstructor> {
  const win = window as Record<string, unknown>;

  // astro-pagefind already loads PagefindUI onto window
  if (typeof win.PagefindUI === "function") {
    return win.PagefindUI as PagefindUIConstructor;
  }

  // Fallback: load via script tag
  await new Promise<void>((resolve, reject) => {
    const src = `${basePath}/pagefind/pagefind-ui.js`;
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

  if (typeof win.PagefindUI === "function") {
    return win.PagefindUI as PagefindUIConstructor;
  }

  throw new Error("PagefindUI not available");
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
        const PagefindUI = await getPagefindUI(basePath);
        if (cancelled || !containerRef.current) return;

        if (!uiRef.current) {
          uiRef.current = new PagefindUI({
            element: containerRef.current,
            showImages: false,
            showSubResults: true,
            showEmptyFilters: false,
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
            className="pagefind-search-modal relative w-full max-w-4xl bg-surface rounded-xl shadow-2xl border border-neutral-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div ref={containerRef} />
          </div>
        </div>
      )}
    </>
  );
}
