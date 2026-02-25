/**
 * PreferencesPanel — composite accessibility settings panel.
 *
 * Groups all display preference toggles (theme, contrast, motion,
 * transparency, font size) into a single accessible settings panel.
 * Each toggle is also available individually for à la carte usage.
 *
 * Accessibility:
 * - role="group" with aria-label for the overall panel
 * - Each subsection labelled with visible text
 * - All toggles use role="radiogroup" internally
 */

import { ThemeToggle } from "./ThemeToggle";
import { ContrastToggle } from "./ContrastToggle";
import { MotionToggle } from "./MotionToggle";
import { TransparencyToggle } from "./TransparencyToggle";
import { FontSizeToggle } from "./FontSizeToggle";

interface PreferencesPanelProps {
  className?: string;
}

const sections = [
  { label: "Theme", Component: ThemeToggle },
  { label: "Font size", Component: FontSizeToggle },
  { label: "Contrast", Component: ContrastToggle },
  { label: "Motion", Component: MotionToggle },
  { label: "Transparency", Component: TransparencyToggle },
] as const;

export function PreferencesPanel({ className = "" }: PreferencesPanelProps) {
  return (
    <div
      role="group"
      aria-label="Display preferences"
      className={`flex flex-col gap-3 ${className}`}
    >
      {sections.map(({ label, Component }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-500">{label}</span>
          <Component />
        </div>
      ))}
    </div>
  );
}
