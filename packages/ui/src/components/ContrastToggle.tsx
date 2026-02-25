/**
 * ContrastToggle — manual override for prefers-contrast.
 *
 * Three options: Normal (force low contrast), System (follow OS),
 * More (force high contrast).
 *
 * Applies via data-contrast attribute on <html>.
 * CSS in theme.css handles both @media(prefers-contrast) and [data-contrast].
 */

import { useState, useEffect } from "react";
import { CircleIcon, MonitorIcon, ContrastIcon } from "../icons";

type ContrastPref = "normal" | "system" | "more";

const STORAGE_KEY = "cv-contrast";

function applyContrast(pref: ContrastPref) {
  const el = document.documentElement;
  if (pref === "system") {
    delete el.dataset.contrast;
  } else {
    el.dataset.contrast = pref;
  }
}

function getStored(): ContrastPref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "normal" || v === "system" || v === "more") return v;
  } catch {}
  return "system";
}

const options: { value: ContrastPref; label: string; icon: React.ReactNode }[] = [
  { value: "normal", label: "Normal contrast", icon: <CircleIcon size="sm" className="opacity-40" /> },
  { value: "system", label: "System contrast", icon: <MonitorIcon size="sm" /> },
  { value: "more", label: "More contrast", icon: <ContrastIcon size="sm" /> },
];

export function ContrastToggle() {
  const [pref, setPref] = useState<ContrastPref>("system");

  useEffect(() => {
    const stored = getStored();
    setPref(stored);
    applyContrast(stored);
  }, []);

  function select(value: ContrastPref) {
    setPref(value);
    applyContrast(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }

  return (
    <div
      className="flex rounded-lg border border-neutral-200 p-0.5 bg-surface-sunken"
      role="radiogroup"
      aria-label="Contrast preference"
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
