/**
 * Privacy & Cookie Preferences: the one first-party record of what a visitor
 * has seen and chosen, kept in this browser's local storage.
 *
 * NevOut uses no optional analytics and no advertising technology, so there is
 * nothing to switch on or off yet. The record only remembers that the notice
 * was acknowledged, so it is not shown again. It never holds account, pharmacy,
 * customer or identity information, and nothing in the app waits on it.
 *
 * Raise PREFS_VERSION when the preference model changes materially (for
 * example, if an optional category is ever introduced): every visitor then
 * sees the notice again.
 */
export const PREFS_VERSION = 1;
export const PREFS_KEY = "nevoutmeds_privacy_prefs";

export type PrivacyPrefs = {
  version: number;
  acknowledged: true;
  /** Always false: NevOut does not use optional analytics. Kept so the record's shape is ready for a real choice. */
  optionalAnalytics: false;
  updatedAt: string;
};

/** The stored record, or null if there is none, it is unreadable, or it has an unexpected shape. */
export function readPrefs(storage: Pick<Storage, "getItem"> | null = safeStorage()): PrivacyPrefs | null {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || typeof v.version !== "number" || v.acknowledged !== true || typeof v.updatedAt !== "string") return null;
    return { version: v.version, acknowledged: true, optionalAnalytics: false, updatedAt: v.updatedAt };
  } catch {
    return null;
  }
}

/** True until the current version of the notice has been acknowledged in this browser. */
export function needsNotice(storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  const p = readPrefs(storage);
  return !p || p.version < PREFS_VERSION;
}

/** Records the acknowledgment. Returns false if the browser would not store it (private mode, storage blocked). */
export function saveAcknowledgment(storage: Pick<Storage, "setItem"> | null = safeStorage(), now = new Date()): boolean {
  const record: PrivacyPrefs = { version: PREFS_VERSION, acknowledged: true, optionalAnalytics: false, updatedAt: now.toISOString() };
  try {
    if (!storage) return false;
    storage.setItem(PREFS_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Opens the Privacy & Cookie Preferences panel from anywhere (footer, Help, the Cookies page). */
export const OPEN_EVENT = "nevout:privacy-preferences";
export function openPrivacyPreferences() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}
