/**
 * Shared preferences store — single localStorage object for cross-site sharing.
 *
 * All display preference toggles read/write through this module so that
 * preferences are stored as one JSON object under a single key. This makes
 * it straightforward to synchronize preferences across multiple sites on
 * the same domain (web, docs, design).
 */

export interface Preferences {
  theme: "light" | "dark" | "system";
  contrast: "normal" | "system" | "more";
  motion: "full" | "system" | "reduce";
  transparency: "normal" | "system" | "reduce";
  fontSize: "sm" | "base" | "lg";
}

const STORAGE_KEY = "cv-preferences";

const DEFAULTS: Preferences = {
  theme: "system",
  contrast: "system",
  motion: "system",
  transparency: "system",
  fontSize: "base",
};

/** Read all preferences from localStorage, falling back to defaults. */
export function getPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {}
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
