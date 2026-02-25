/**
 * MotionToggle — manual override for prefers-reduced-motion.
 *
 * Three options: Full (force animations on), System (follow OS),
 * Reduced (force animations off).
 *
 * Applies via data-motion attribute on <html>.
 * CSS in theme.css handles both @media(prefers-reduced-motion) and [data-motion].
 */

import { useState, useEffect } from "react";
import { PlayIcon, MonitorIcon, PauseIcon } from "../icons";

type MotionPref = "full" | "system" | "reduce";

const STORAGE_KEY = "cv-motion";

function applyMotion(pref: MotionPref) {
  const el = document.documentElement;
  if (pref === "system") {
    delete el.dataset.motion;
  } else {
    el.dataset.motion = pref;
  }
}

function getStored(): MotionPref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "full" || v === "system" || v === "reduce") return v;
  } catch {}
  return "system";
}

const options: { value: MotionPref; label: string; icon: React.ReactNode }[] = [
  { value: "full", label: "Full motion", icon: <PlayIcon size="sm" /> },
  { value: "system", label: "System motion", icon: <MonitorIcon size="sm" /> },
  { value: "reduce", label: "Reduce motion", icon: <PauseIcon size="sm" /> },
];

export function MotionToggle() {
  const [pref, setPref] = useState<MotionPref>("system");

  useEffect(() => {
    const stored = getStored();
    setPref(stored);
    applyMotion(stored);
  }, []);

  function select(value: MotionPref) {
    setPref(value);
    applyMotion(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }

  return (
    <div
      className="flex rounded-lg border border-neutral-200 p-0.5 bg-surface-sunken"
      role="radiogroup"
      aria-label="Motion preference"
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
