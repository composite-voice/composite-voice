/**
 * Shared preferences store — cookie-based for cross-site sharing.
 *
 * Uses a single cookie shared across ports (localhost dev) and across
 * subdomains (production custom domains via domain= attribute).
 * For hosts where cookie sharing is impossible (Netlify preview),
 * the inline FOUC scripts use URL param transfer as a fallback.
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
 * Compute domain= attribute for cross-subdomain cookie sharing.
 * - localhost/127.0.0.1: "" (ports share cookies automatically)
 * - Public suffixes (*.netlify.dev, etc.): "" (browsers block these)
 * - Custom domains (docs.example.com): ";domain=.example.com"
 */
function getCookieDomain(): string {
  try {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return "";
    if (/\.(netlify\.dev|netlify\.app|vercel\.app|pages\.dev|github\.io)$/.test(h)) return "";
    const parts = h.split(".");
    if (parts.length >= 2) return `;domain=.${parts.slice(-2).join(".")}`;
  } catch {}
  return "";
}

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
    document.cookie = `${STORAGE_KEY}=${encoded};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax${getCookieDomain()}`;
  } catch {}
}
