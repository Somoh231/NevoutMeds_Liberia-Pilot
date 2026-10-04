/**
 * Which URLs may establish a Supabase session (final security audit, URL session swap).
 *
 * Supabase email links (password recovery / operator setup link, invitation,
 * sign-up confirmation) return to the app with the session in the URL fragment
 * (`#access_token=…&refresh_token=…`). By default supabase-js accepts such a
 * fragment on ANY page and silently replaces whoever is signed in, so a crafted
 * link could move a signed-in pharmacist into another account's pharmacy.
 *
 * Policy:
 *   * only the routes those email links point at may consume a URL session
 *     (AuthProvider: /onboarding, /accept-invite, /reset-password; staff-admin
 *     invitations: /accept-invite; ops/provision setup links: /reset-password);
 *   * never while a session is already stored on this device: the person must
 *     sign out first and open the link again;
 *   * a refused URL session is removed from the address bar and history.
 */
export const URL_SESSION_ROUTES: readonly string[] = ["/reset-password", "/accept-invite", "/onboarding"];

/** URL parameters that carry (or report on) a Supabase session. */
const AUTH_PARAMS = [
  "access_token", "refresh_token", "expires_in", "expires_at", "token_type", "type",
  "provider_token", "provider_refresh_token", "error", "error_code", "error_description"
];

export type UrlSessionRejection = "signed-in" | "route";

export function hasUrlSessionParams(params: Record<string, string>): boolean {
  return Boolean(params.access_token || params.error_description);
}

/**
 * Decides whether a URL carrying session parameters may establish a session.
 * Pure, so it can be tested without a browser.
 */
export function decideUrlSession(
  pathname: string,
  params: Record<string, string>,
  hasStoredSession: boolean
): { accept: boolean; rejection: UrlSessionRejection | null } {
  if (!hasUrlSessionParams(params)) return { accept: false, rejection: null };
  const path = pathname.replace(/\/+$/, "") || "/";
  if (!URL_SESSION_ROUTES.includes(path)) return { accept: false, rejection: "route" };
  if (hasStoredSession) return { accept: false, rejection: "signed-in" };
  return { accept: true, rejection: null };
}

/** The same URL without any session parameters (fragment or query). Keeps other query parameters, e.g. ?token= on /accept-invite. */
export function withoutAuthParams(href: string): string {
  const u = new URL(href);
  const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
  const search = new URLSearchParams(u.search);
  for (const k of AUTH_PARAMS) {
    hash.delete(k);
    search.delete(k);
  }
  const q = search.toString();
  const h = hash.toString();
  return `${u.pathname}${q ? `?${q}` : ""}${h ? `#${h}` : ""}`;
}
