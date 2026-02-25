/**
 * FontSizeToggle — base font-size preference.
 *
 * Three options: Small (87.5%), Base (100%, browser default), Large (112.5%).
 * Browser-native scaling via percentage on :root — all rem-based
 * typography scales proportionally.
 *
 * Applies via data-font-size attribute on <html>.
 * CSS in theme.css sets font-size percentage per value.
 */

import { useState, useEffect } from "react";
import { getPreference, setPreference } from "../preferences";

type FontSizePref = "sm" | "base" | "lg";

function applyFontSize(pref: FontSizePref) {
  const el = document.documentElement;
  if (pref === "base") {
    delete el.dataset.fontSize;
  } else {
    el.dataset.fontSize = pref;
  }
}

const options: { value: FontSizePref; label: string; icon: React.ReactNode }[] = [
  {
    value: "sm",
    label: "Small text",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
        <text x="12" y="17" textAnchor="middle" fill="currentColor" fontSize="13" fontWeight="600" fontFamily="system-ui, sans-serif">A</text>
      </svg>
    ),
  },
  {
    value: "base",
    label: "Default text",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
        <text x="12" y="18" textAnchor="middle" fill="currentColor" fontSize="17" fontWeight="600" fontFamily="system-ui, sans-serif">A</text>
      </svg>
    ),
  },
  {
    value: "lg",
    label: "Large text",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
        <text x="12" y="19" textAnchor="middle" fill="currentColor" fontSize="21" fontWeight="600" fontFamily="system-ui, sans-serif">A</text>
      </svg>
    ),
  },
];

export function FontSizeToggle() {
  const [pref, setPref] = useState<FontSizePref>("base");

  useEffect(() => {
    const stored = getPreference("fontSize");
    setPref(stored);
    applyFontSize(stored);
  }, []);

  function select(value: FontSizePref) {
    setPref(value);
    applyFontSize(value);
    setPreference("fontSize", value);
  }

  return (
    <div
      className="flex rounded-lg border border-neutral-200 p-0.5 bg-surface-sunken"
      role="radiogroup"
      aria-label="Font size preference"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={pref === opt.value}
          aria-label={opt.label}
          title={opt.label}
          onClick={() => select(opt.value)}
          className={`flex-1 flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            pref === opt.value
              ? "bg-surface text-foreground shadow-card"
              : "text-foreground-muted hover:text-foreground"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
