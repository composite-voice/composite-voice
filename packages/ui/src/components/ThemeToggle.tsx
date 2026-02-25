/**
 * ThemeToggle — manual override for prefers-color-scheme.
 *
 * Three options: Light, System (follow OS), Dark.
 * Applies via document.documentElement.style.colorScheme.
 * Persists to localStorage under "cv-theme".
 */

import { useState, useEffect } from "react";
import { SunIcon, MonitorIcon, MoonIcon } from "../icons";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "cv-theme";

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.style.colorScheme = theme === "system" ? "light dark" : theme;
}

function getStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon size="sm" /> },
  { value: "system", label: "System", icon: <MonitorIcon size="sm" /> },
  { value: "dark", label: "Dark", icon: <MoonIcon size="sm" /> },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = getStored();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  function select(value: Theme) {
    setTheme(value);
    applyTheme(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
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
              ? "bg-surface text-neutral-900 shadow-card"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
