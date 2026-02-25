/**
 * Shared preferences store — localStorage + cookie for cross-site sharing.
 *
 * All display preference toggles read/write through this module so that
 * preferences are stored as one JSON object under a single key.
 *
 * Because localStorage is origin-scoped (each port is a separate origin in
 * dev), we also sync to a cookie. Cookies are shared across ports on the
 * same hostname, so changing theme on :4321 is visible on :4323 immediately.
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

/**
 * Compute the domain attribute for cross-subdomain cookie sharing.
 * - localhost/127.0.0.1: omit domain (ports share cookies automatically)
 * - Custom domain (docs.example.com): set domain=.example.com
 * - Public suffixes (*.netlify.dev): returns "" — browsers block these
 */
function getCookieDomain(): string {
  try {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return "";
    const parts = h.split(".");
    if (parts.length >= 2) {
      return `;domain=.${parts.slice(-2).join(".")}`;
    }
  } catch {}
  return "";
}

/** Write preferences to a cookie (shared across ports/subdomains). */
function writeCookie(prefs: Preferences): void {
  try {
    const value = encodeURIComponent(JSON.stringify(prefs));
    document.cookie = `${STORAGE_KEY}=${value};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax${getCookieDomain()}`;
  } catch {}
}

/** Read preferences from cookie (fallback when localStorage is empty). */
function readCookie(): Partial<Preferences> {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${STORAGE_KEY}=([^;]*)`));
    if (match) return JSON.parse(decodeURIComponent(match[1]));
  } catch {}
  return {};
}

/** Read all preferences from localStorage, falling back to cookie then defaults. */
export function getPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {}

  // Fallback: read from cookie (cross-port sync)
  const fromCookie = readCookie();
  if (Object.keys(fromCookie).length > 0) {
    // Hydrate localStorage from cookie so future reads are fast
    const prefs = { ...DEFAULTS, ...fromCookie };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
    return prefs;
  }

  return { ...DEFAULTS };
}

/** Read a single preference value. */
export function getPreference<K extends keyof Preferences>(key: K): Preferences[K] {
  return getPreferences()[key];
}

/** Update a single preference value, merging into the stored object. */
export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  try {
    const current = getPreferences();
    current[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    writeCookie(current);
  } catch {}
}

/**
 * Migrate from legacy per-key storage to the unified object.
 * Call once on app init. Reads old keys, merges into the new object,
 * then removes the old keys.
 */
export function migratePreferences(): void {
  try {
    const legacyMap: Record<string, keyof Preferences> = {
      "cv-theme": "theme",
      "cv-contrast": "contrast",
      "cv-motion": "motion",
      "cv-transparency": "transparency",
      "cv-font-size": "fontSize",
    };

    let migrated = false;
    const current = getPreferences();

    for (const [oldKey, newKey] of Object.entries(legacyMap)) {
      const oldValue = localStorage.getItem(oldKey);
      if (oldValue !== null) {
        (current as Record<string, string>)[newKey] = oldValue;
        localStorage.removeItem(oldKey);
        migrated = true;
      }
    }

    if (migrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    }
  } catch {}
}
