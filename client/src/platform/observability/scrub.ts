/**
 * Privacy scrubbing for error reports (Phase 11, docs/observability/SENTRY_PRIVACY_POLICY.md).
 *
 * Pure and dependency-free (tested directly by supabase/tests/sentry_privacy.test.mjs).
 * Everything that leaves the device for monitoring passes through scrubEvent():
 * strings are redacted for tokens, secrets, emails, phone numbers and long
 * digit runs; request data, cookies, headers, user objects and breadcrumbs are
 * dropped; URLs lose their query and fragment. When in doubt, a field is removed.
 */

const REDACTIONS: Array<[RegExp, string]> = [
  // JWTs (Supabase access/refresh tokens are JWT or opaque; both covered below)
  [/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, "[jwt]"],
  // Authorization headers / bearer values
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [token]"],
  // Supabase secret / publishable keys and generic sk_/pk_ style keys
  [/\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g, "[key]"],
  // otpauth:// URIs (TOTP setup payloads carry the secret)
  [/otpauth:\/\/[^\s"']+/gi, "[otpauth]"],
  // key=value pairs whose key names a secret or personal field
  [/\b(access_token|refresh_token|provider_token|token|apikey|api_key|secret|password|passwd|code|otp|totp|email|phone|name|first_name|last_name|note|notes)=([^&\s"']+)/gi, "$1=[redacted]"],
  // JSON-style "key": "value" for the same keys
  [/"(access_token|refresh_token|token|apikey|secret|password|code|otp|totp|email|phone|first_name|last_name|name|note|notes|allergies|conditions)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"'],
  // Email addresses
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // Phone numbers: optional +, 7+ digits allowing spaces/dashes/brackets
  [/\+?\d[\d\s().-]{6,}\d/g, "[number]"],
  // Base32 strings that look like TOTP secrets (16+ chars of A-Z2-7)
  [/\b[A-Z2-7]{16,}\b/g, "[secret]"]
];

export function scrubString(input: string): string {
  let s = String(input);
  for (const [re, rep] of REDACTIONS) s = s.replace(re, rep);
  return s.length > 1000 ? `${s.slice(0, 1000)}…` : s;
}

/** Strips query string and fragment; keeps origin and path (routes carry no personal data). */
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url, "https://app.invalid");
    const clean = `${u.origin === "https://app.invalid" ? "" : u.origin}${u.pathname}`;
    return scrubString(clean);
  } catch {
    return scrubString(String(url).split(/[?#]/)[0]);
  }
}

const DROP_KEYS = new Set(["cookies", "headers", "data", "query_string", "env", "user", "request_body", "response_body", "body"]);

function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP_KEYS.has(k)) continue;
      if (/token|secret|password|apikey|authorization|cookie|email|phone/i.test(k)) { out[k] = "[redacted]"; continue; }
      out[k] = scrubDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

type AnyEvent = {
  message?: string;
  user?: unknown;
  request?: { url?: string; [k: string]: unknown };
  breadcrumbs?: unknown[];
  exception?: { values?: Array<{ type?: string; value?: string; stacktrace?: { frames?: Array<Record<string, unknown>> } }> };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  transaction?: string;
  server_name?: string;
  [k: string]: unknown;
};

/** Returns a copy safe to send, or the same object mutated in place. */
export function scrubEvent<T extends AnyEvent>(event: T): T {
  delete event.user;
  delete event.server_name;
  // No breadcrumbs at all: console arguments, clicked text and fetched URLs are
  // exactly where personal data hides. Our own route breadcrumbs are added
  // after scrubbing by the caller when useful.
  event.breadcrumbs = [];
  if (event.request) event.request = { url: scrubUrl(event.request.url) };
  if (event.message) event.message = scrubString(event.message);
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubString(ex.value);
    for (const f of ex.stacktrace?.frames ?? []) {
      delete f.vars;
      delete f.pre_context;
      delete f.context_line;
      delete f.post_context;
      if (typeof f.abs_path === "string") f.abs_path = scrubUrl(f.abs_path);
      if (typeof f.filename === "string") f.filename = scrubUrl(f.filename);
    }
  }
  if (event.extra) event.extra = scrubDeep(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubDeep(event.contexts) as Record<string, unknown>;
  if (event.tags) event.tags = scrubDeep(event.tags) as Record<string, unknown>;
  return event;
}

/**
 * Expected behaviour is not an error to monitor: wrong passwords and codes,
 * validation, duplicates, conflicts, permission refusals and anything that
 * happens because the device is offline.
 */
export function isExpectedError(err: unknown, online = typeof navigator === "undefined" ? true : navigator.onLine !== false): boolean {
  const e = err as { name?: string; message?: string; code?: string | number; status?: number; __expected?: boolean } | null | undefined;
  if (!e) return true;
  if (e.__expected) return true;
  const msg = String(e.message ?? e ?? "");
  const code = String(e.code ?? "");
  if (!online) return true;
  if (/^(AuthApiError|AuthWeakPasswordError|AuthSessionMissingError)$/.test(String(e.name)) && (e.status ?? 0) < 500) return true;
  if (/invalid login credentials|email not confirmed|invalid totp|mfa_verification_failed|user already registered|password should be/i.test(msg)) return true;
  if (["23505", "23503", "23514", "22023", "42501", "P0001", "PGRST116", "mfa_verification_failed", "invalid_credentials"].includes(code)) return true;
  if ([401, 403, 409, 413, 415, 422].includes(Number(e.status ?? 0))) return true;
  if (/conflict|validation|duplicate|already exists|stale version|version mismatch/i.test(msg)) return true;
  if (/^AbortError$/.test(String(e.name)) || /aborted|Failed to fetch|NetworkError|Load failed|network request failed/i.test(msg)) return true;
  if (/ResizeObserver loop/i.test(msg)) return true;
  return false;
}

/** One-way pseudonym for a tenant/user id: enough to group reports, not to identify. */
export async function pseudonym(id: string | null | undefined, salt = "nevout-monitoring-v1"): Promise<string | undefined> {
  if (!id || typeof crypto === "undefined" || !crypto.subtle) return undefined;
  const bytes = new TextEncoder().encode(`${salt}:${id}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}
