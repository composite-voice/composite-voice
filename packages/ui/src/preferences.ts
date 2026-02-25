/**
 * Shared preferences store — cookie-based for cross-site sharing.
 *
 * Uses a single cookie scoped to the current hostname. Cookies are
 * shared across ports on the same hostname (localhost:4321 ↔ :4323),
 * making preferences set on one dev site immediately visible on others.
 */

export interface Preferences {
  theme: "light" | "dark" | "system";
  contrast: "normal" | "system" | "more";
  motion: "full" | "system" | "reduce";
  transparency: "normal" | "system" | "reduce";
  fontSize: "sm" | "base" | "lg";
}

const STORAGE_KEY = "cv-preferences";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

const DEFAULTS: Preferences = {
  theme: "system",
  contrast: "system",
  motion: "system",
  transparency: "system",
  fontSize: "base",
};

/** Read all preferences from cookie, falling back to defaults. */
export function getPreferences(): Preferences {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${STORAGE_KEY}=([^;]*)`));
    if (match) {
      return { ...DEFAULTS, ...JSON.parse(decodeURIComponent(match[1])) };
    }
  } catch {}
  return { ...DEFAULTS };
}

/** Read a single preference value. */
export function getPreference<K extends keyof Preferences>(key: K): Preferences[K] {
  return getPreferences()[key];
}

/** Update a single preference value, merging into the stored cookie. */
export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  try {
    const current = getPreferences();
    current[key] = value;
    const encoded = encodeURIComponent(JSON.stringify(current));
    document.cookie = `${STORAGE_KEY}=${encoded};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  } catch {}
}
