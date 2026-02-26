/**
 * Sidebar — fixed left navigation panel.
 *
 * Renders navigation links with active state highlighting. Supports
 * both flat links and collapsible category groups with nested children.
 * On mobile, the sidebar is hidden off-screen and toggled via custom
 * DOM events dispatched by the Navbar component. An overlay covers
 * the content area when the sidebar is open on mobile.
 */

import { useState, useEffect } from "react";

/** A single navigable link. */
export interface SidebarLink {
  href: string;
  label: string;
}

/** A labelled group containing nested links. */
export interface SidebarGroup {
  label: string;
  children: SidebarLink[];
}

/** A sidebar item is either a direct link or a collapsible group. */
export type SidebarItem = SidebarLink | SidebarGroup;

/** @deprecated Use `SidebarLink` or `SidebarItem` instead. */
export type SidebarSection = SidebarLink;

function isGroup(item: SidebarItem): item is SidebarGroup {
  return "children" in item;
}

export interface SidebarProps {
  /** Navigation items — flat links and/or labelled groups */
  sections: SidebarItem[];
  /** Current page path for active link highlighting */
  currentPath: string;
  /** Accessible label for the nav element */
  ariaLabel?: string;
}

function NavLink({
  href,
  label,
  currentPath,
  indent,
}: SidebarLink & { currentPath: string; indent?: boolean }) {
  const isActive = currentPath === href || currentPath === `${href}/`;
  return (
    <li>
      <a
        href={href}
        className={`block py-2 text-sm font-medium rounded-lg transition-colors ${
          indent ? "px-6" : "px-3"
        } ${
          isActive
            ? "bg-primary-50 text-primary-700"
            : "text-foreground-muted hover:bg-neutral-50 hover:text-foreground"
        }`}
        aria-current={isActive ? "page" : undefined}
      >
        {label}
      </a>
    </li>
  );
}

function NavGroup({
  label,
  children,
  currentPath,
  defaultOpen,
}: SidebarGroup & { currentPath: string; defaultOpen: boolean }) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground-muted/70 hover:text-foreground transition-colors"
      >
        {label}
        <svg
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {expanded && (
        <ul className="space-y-0.5" role="group" aria-label={label}>
          {children.map((child) => (
            <NavLink
              key={child.href}
              {...child}
              currentPath={currentPath}
              indent
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Sidebar({
  sections,
  currentPath,
  ariaLabel = "Navigation",
}: SidebarProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleToggle() {
      setOpen((prev) => {
        const next = !prev;
        window.dispatchEvent(
          new CustomEvent("cv-sidebar-state", { detail: { open: next } }),
        );
        return next;
      });
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen((prev) => {
          if (prev) {
            window.dispatchEvent(
              new CustomEvent("cv-sidebar-state", {
                detail: { open: false },
              }),
            );
            return false;
          }
          return prev;
        });
      }
    }

    window.addEventListener("cv-toggle-sidebar", handleToggle);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("cv-toggle-sidebar", handleToggle);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function close() {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("cv-sidebar-state", { detail: { open: false } }),
    );
  }

  return (
    <>
      <div
        className={`fixed inset-0 top-14 z-30 bg-surface-overlay md:hidden ${open ? "" : "hidden"}`}
        aria-hidden="true"
        onClick={close}
      />
      <nav
        className={`fixed top-14 left-0 w-64 h-[calc(100vh-3.5rem)] bg-surface border-r border-neutral-200 overflow-y-auto flex flex-col z-40 transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label={ariaLabel}
      >
        <ul className="px-3 py-4 space-y-0.5" role="list">
          {sections.map((item) =>
            isGroup(item) ? (
              <NavGroup
                key={item.label}
                {...item}
                currentPath={currentPath}
                defaultOpen={item.children.some(
                  (c) =>
                    currentPath === c.href ||
                    currentPath === `${c.href}/`,
                )}
              />
            ) : (
              <NavLink
                key={item.href}
                {...item}
                currentPath={currentPath}
              />
            ),
          )}
        </ul>
      </nav>
    </>
  );
}
