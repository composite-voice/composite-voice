/**
 * Footer — shared page footer with site links and display preferences.
 *
 * Renders copyright, cross-site navigation links, a GitHub link,
 * and the full set of display preference toggles (font size, contrast,
 * motion, transparency).
 */

import { BrandName } from './BrandName';
import { FontSizeToggle } from './FontSizeToggle';
import { ContrastToggle } from './ContrastToggle';
import { MotionToggle } from './MotionToggle';
import { TransparencyToggle } from './TransparencyToggle';

export interface FooterSite {
  href: string;
  label: string;
}

export interface FooterProps {
  /** Cross-site navigation links */
  sites: FooterSite[];
  /** Additional classes for the footer element */
  className?: string;
}

export function Footer({ sites, className }: FooterProps) {
  return (
    <footer className={`border-t border-neutral-200 ${className || ''}`}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-8">
          <p className="text-xs text-foreground-muted">
            &copy; {new Date().getFullYear()} <BrandName />. All rights reserved.
          </p>
          <nav className="flex items-center gap-4" aria-label="Footer navigation">
            {sites.map(({ href, label }) => (
              <a
                key={label}
                href={href}
                className="text-xs text-foreground-muted hover:text-foreground transition-colors"
              >
                {label}
              </a>
            ))}
            <a
              href="https://github.com/lukeocodes/composite-voice"
              className="text-xs text-foreground-muted hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>

        <div
          role="group"
          aria-label="Display preferences"
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-medium text-foreground-muted uppercase tracking-wider">
              Font size
            </span>
            <FontSizeToggle />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-medium text-foreground-muted uppercase tracking-wider">
              Contrast
            </span>
            <ContrastToggle />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-medium text-foreground-muted uppercase tracking-wider">
              Motion
            </span>
            <MotionToggle />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-medium text-foreground-muted uppercase tracking-wider">
              Transparency
            </span>
            <TransparencyToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
