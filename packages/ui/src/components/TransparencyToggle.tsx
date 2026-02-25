/**
 * TransparencyToggle — manual override for prefers-reduced-transparency.
 *
 * Three options: Normal (force transparency on), System (follow OS),
 * Reduced (force solid backgrounds).
 *
 * Applies via data-transparency attribute on <html>.
 * CSS in theme.css handles both @media(prefers-reduced-transparency) and [data-transparency].
 */

import { useState, useEffect } from "react";
import { LayersIcon, MonitorIcon, SquareIcon } from "../icons";

type TransparencyPref = "normal" | "system" | "reduce";

const STORAGE_KEY = "cv-transparency";

function applyTransparency(pref: TransparencyPref) {
  const el = document.documentElement;
  if (pref === "system") {
    delete el.dataset.transparency;
  } else {
    el.dataset.transparency = pref;
  }
}

function getStored(): TransparencyPref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "normal" || v === "system" || v === "reduce") return v;
  } catch {}
  return "system";
}

const options: { value: TransparencyPref; label: string; icon: React.ReactNode }[] = [
  { value: "normal", label: "Normal transparency", icon: <LayersIcon size="sm" /> },
  { value: "system", label: "System transparency", icon: <MonitorIcon size="sm" /> },
  { value: "reduce", label: "Reduce transparency", icon: <SquareIcon size="sm" /> },
];

export function TransparencyToggle() {
  const [pref, setPref] = useState<TransparencyPref>("system");

  useEffect(() => {
    const stored = getStored();
    setPref(stored);
    applyTransparency(stored);
  }, []);

  function select(value: TransparencyPref) {
    setPref(value);
    applyTransparency(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }

  return (
    <div
      className="flex rounded-lg border border-neutral-200 p-0.5 bg-surface-sunken"
      role="radiogroup"
      aria-label="Transparency preference"
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
