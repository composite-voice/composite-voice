/**
 * Navbar — shared top navigation bar.
 *
 * Renders a fixed header with cross-site navigation, GitHub link,
 * and theme toggle. Supports an optional sidebar mode with a mobile
 * menu toggle that communicates with the Sidebar component via
 * custom DOM events.
 */

import { useState, useEffect } from "react";
import { BrandName } from "./BrandName";
import { ThemeToggle } from "./ThemeToggle";
import { MenuIcon, GitHubIcon } from "../icons";

export interface NavbarSite {
  href: string;
  label: string;
  current?: boolean;
}

export interface NavbarProps {
  /** Cross-site navigation links */
  sites: NavbarSite[];
  /** Version string shown as a badge next to the logo */
  version?: string;
  /** Enable sidebar mode: shows mobile menu toggle, adjusts layout */
  hasSidebar?: boolean;
  /** Additional classes for the header element */
  className?: string;
}

export function Navbar({
  sites,
  version,
  hasSidebar = false,
  className,
}: NavbarProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    function handleState(e: Event) {
      setSidebarOpen((e as CustomEvent).detail.open);
    }
    window.addEventListener("cv-sidebar-state", handleState);
    return () => window.removeEventListener("cv-sidebar-state", handleState);
  }, []);

  function toggleSidebar() {
    window.dispatchEvent(new CustomEvent("cv-toggle-sidebar"));
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 h-14 z-50 bg-surface border-b border-neutral-200 ${className || ""}`}
    >
      <div
        className={`flex items-center h-full px-4${!hasSidebar ? " max-w-6xl mx-auto sm:px-6" : ""}`}
      >
        {hasSidebar && (
          <button
            type="button"
            className="md:hidden mr-3 p-1.5 -ml-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-neutral-100 transition-colors"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            onClick={toggleSidebar}
          >
            <MenuIcon />
          </button>
        )}

        <a href="/" className="flex items-center gap-2 mr-6 shrink-0">
          <BrandName className="text-base font-bold text-foreground tracking-tight" />
          {version && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-badge text-[0.65rem] font-medium bg-primary-100 text-primary-700">
              v{version}
            </span>
          )}
        </a>

        <nav className="flex items-center gap-1" aria-label="Sites">
          {sites.map(({ href, label, current }) => (
            <a
              key={label}
              href={href}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                current
                  ? "text-foreground bg-neutral-100"
                  : "text-foreground-muted hover:text-foreground hover:bg-neutral-100"
              }`}
              aria-current={current ? "true" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex-1" />

        <a
          href="https://github.com/lukeocodes/composite-voice"
          className="p-2 rounded-md text-foreground-muted hover:text-foreground hover:bg-neutral-100 transition-colors"
          aria-label="GitHub repository"
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitHubIcon />
        </a>

        <div
          className={
            hasSidebar
              ? "hidden md:flex items-center ml-2!"
              : "ml-2"
          }
        >
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
