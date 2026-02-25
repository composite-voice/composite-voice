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
import { getPreference, setPreference } from "../preferences";

type MotionPref = "full" | "system" | "reduce";

function applyMotion(pref: MotionPref) {
  const el = document.documentElement;
  if (pref === "system") {
    delete el.dataset.motion;
  } else {
    el.dataset.motion = pref;
  }
}

const options: { value: MotionPref; label: string; icon: React.ReactNode }[] = [
  { value: "full", label: "Full motion", icon: <PlayIcon size="sm" /> },
  { value: "system", label: "System motion", icon: <MonitorIcon size="sm" /> },
  { value: "reduce", label: "Reduce motion", icon: <PauseIcon size="sm" /> },
];

export function MotionToggle() {
  const [pref, setPref] = useState<MotionPref>("system");

  useEffect(() => {
    const stored = getPreference("motion");
    setPref(stored);
    applyMotion(stored);
  }, []);

  function select(value: MotionPref) {
    setPref(value);
    applyMotion(value);
    setPreference("motion", value);
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
