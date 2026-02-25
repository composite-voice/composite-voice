/**
 * ThemeToggle — manual override for prefers-color-scheme.
 *
 * Three options: Light, System (follow OS), Dark.
 * Applies via document.documentElement.style.colorScheme.
 * Persists to localStorage under "cv-theme".
 */

import { useState, useEffect } from "react";
import { SunIcon, MonitorIcon, MoonIcon } from "../icons";
import { getPreference, setPreference } from "../preferences";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.style.colorScheme = theme === "system" ? "light dark" : theme;

  // Set data-theme for Starlight CSS compatibility (harmless on non-Starlight sites)
  if (theme === "system") {
    const preferLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    el.dataset.theme = preferLight ? "light" : "dark";
  } else {
    el.dataset.theme = theme;
  }
}

const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon size="sm" /> },
  { value: "system", label: "System", icon: <MonitorIcon size="sm" /> },
  { value: "dark", label: "Dark", icon: <MoonIcon size="sm" /> },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = getPreference("theme");
    setTheme(stored);
    applyTheme(stored);
  }, []);

  function select(value: Theme) {
    setTheme(value);
    applyTheme(value);
    setPreference("theme", value);
  }

  return (
    <div
      className="flex rounded-lg border border-neutral-200 p-0.5 bg-surface-sunken"
      role="radiogroup"
      aria-label="Color theme"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={theme === opt.value}
          aria-label={opt.label}
          title={opt.label}
          onClick={() => select(opt.value)}
          className={`flex-1 flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            theme === opt.value
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
