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

/** A labelled group containing nested links and/or sub-groups. */
export interface SidebarGroup {
  label: string;
  children: SidebarItem[];
}

/** A sidebar item is either a direct link or a collapsible group. */
export type SidebarItem = SidebarLink | SidebarGroup;

/** @deprecated Use `SidebarLink` or `SidebarItem` instead. */
export type SidebarSection = SidebarLink;

function isGroup(item: SidebarItem): item is SidebarGroup {
  return "children" in item;
}

/** Recursively check whether any descendant link matches the current path. */
function hasActiveChild(items: SidebarItem[], currentPath: string): boolean {
  return items.some((item) => {
    if (isGroup(item)) {
      return hasActiveChild(item.children, currentPath);
    }
    return currentPath === item.href || currentPath === `${item.href}/`;
  });
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
  depth = 0,
}: SidebarLink & { currentPath: string; depth?: number }) {
  const isActive = currentPath === href || currentPath === `${href}/`;
  /* depth 0 = top-level link (px-3), depth 1 = first nesting level (px-6),
     deeper levels get progressively more padding via inline style */
  const paddingClass = depth === 0 ? "px-3" : depth === 1 ? "px-6" : "";
  const paddingStyle = depth > 1 ? { paddingLeft: `${depth * 0.75 + 0.75}rem` } : undefined;

  return (
    <li>
      <a
        href={href}
        className={`block py-2 text-sm font-medium rounded-lg transition-colors ${paddingClass} ${
          isActive
            ? "bg-primary-50 text-primary-700"
            : "text-foreground-muted hover:bg-neutral-50 hover:text-foreground"
        }`}
        style={paddingStyle}
        aria-current={isActive ? "page" : undefined}
      >
        {label}
      </a>
    </li>
  );
}

/** Renders a list of SidebarItems — links render as NavLink, groups as NavSubGroup. */
function NavItems({
  items,
  currentPath,
  depth,
}: {
  items: SidebarItem[];
  currentPath: string;
  depth: number;
}) {
  return (
    <>
      {items.map((item) =>
        isGroup(item) ? (
          <NavSubGroup
            key={item.label}
            label={item.label}
            children={item.children}
            currentPath={currentPath}
            depth={depth}
          />
        ) : (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            currentPath={currentPath}
            depth={depth}
          />
        ),
      )}
    </>
  );
}

/** A collapsible sub-group within a top-level group. */
function NavSubGroup({
  label,
  children,
  currentPath,
  depth,
}: SidebarGroup & { currentPath: string; depth: number }) {
  const isActive = hasActiveChild(children, currentPath);
  const [expanded, setExpanded] = useState(isActive);

  /* depth 1 = first nesting level inside a top-level NavGroup */
  const paddingClass = depth === 1 ? "px-6" : "";
  const paddingStyle = depth > 1 ? { paddingLeft: `${depth * 0.75 + 0.75}rem` } : undefined;

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex w-full items-center justify-between py-2 text-sm font-medium rounded-lg transition-colors ${paddingClass} ${
          isActive
            ? "text-foreground"
            : "text-foreground-muted hover:bg-neutral-50 hover:text-foreground"
        }`}
        style={paddingStyle}
      >
        {label}
        <svg
          className={`h-3.5 w-3.5 shrink-0 mr-1 transition-transform ${expanded ? "rotate-90" : ""}`}
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
        <ul
          className="space-y-0.5 border-l border-neutral-200 ml-6"
          role="group"
          aria-label={label}
        >
          <NavItems items={children} currentPath={currentPath} depth={depth + 1} />
        </ul>
      )}
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
          <NavItems items={children} currentPath={currentPath} depth={1} />
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
                defaultOpen={hasActiveChild(item.children, currentPath)}
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
