import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decideUrlSession, withoutAuthParams, type UrlSessionRejection } from "@/platform/auth/urlSession";

let _client: SupabaseClient | null | undefined;
let _storageKey: string | null = null;
let _urlSessionRejection: UrlSessionRejection | null = null;

/**
 * The key supabase-js stores the session under. It is the library's own default
 * (`sb-<first host label>-auth-token`), set explicitly so that the URL-session
 * policy and an offline sign-out can find it; existing sessions keep working.
 */
export function authStorageKey(url: string) {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

function configuredUrl(): string | null {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined) || null;
}

function hasStoredSession(): boolean {
  try {
    return !!(_storageKey && window.localStorage.getItem(_storageKey));
  } catch {
    return false;
  }
}

function urlParams(href: string): Record<string, string> {
  const u = new URL(href);
  const out: Record<string, string> = {};
  new URLSearchParams(u.search).forEach((v, k) => { out[k] = v; });
  new URLSearchParams(u.hash.replace(/^#/, "")).forEach((v, k) => { out[k] = v; });
  return out;
}

function refuse(rejection: UrlSessionRejection, href: string) {
  _urlSessionRejection = rejection;
  try {
    window.history.replaceState(window.history.state, "", withoutAuthParams(href));
  } catch {
    // cosmetic only: the session is refused either way
  }
}

/**
 * Applies the URL-session policy synchronously at start-up, before the router
 * reads the address bar, so a refused token is gone from the URL and history
 * before anything can copy it back. The client's detectSessionInUrl predicate
 * applies the same policy again (it is what actually decides for supabase-js).
 */
export function screenUrlSession() {
  const url = configuredUrl();
  if (!url || typeof window === "undefined") return;
  _storageKey = _storageKey ?? authStorageKey(url);
  const href = window.location.href;
  const decision = decideUrlSession(new URL(href).pathname, urlParams(href), hasStoredSession());
  if (!decision.accept && decision.rejection) refuse(decision.rejection, href);
}

/** Why a session in the page URL was refused at start-up (null if none was offered or it was accepted). */
export function urlSessionRejection(): UrlSessionRejection | null {
  return _urlSessionRejection;
}

/**
 * Ends the session on THIS device without the network: removes the stored
 * session the way supabase-js's own sign-out does (session, PKCE verifier,
 * user copy). Used when the server sign-out cannot complete (offline). It does
 * not revoke the session on the server.
 */
export function clearLocalAuthSession() {
  if (!_storageKey) return;
  for (const key of [_storageKey, `${_storageKey}-code-verifier`, `${_storageKey}-user`]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // storage unavailable: nothing persisted to clear
    }
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  if (_client !== undefined) return _client;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !anonKey) {
    _client = null;
    return _client;
  }

  _storageKey = authStorageKey(url);
  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: _storageKey,
      // A session in the URL is accepted only from Supabase's own email links,
      // on their routes, and never over a session already on this device
      // (see platform/auth/urlSession.ts).
      detectSessionInUrl: (u, params) => {
        const decision = decideUrlSession(u.pathname, params, hasStoredSession());
        if (!decision.accept && decision.rejection) refuse(decision.rejection, u.href);
        return decision.accept;
      }
    }
  });

  return _client;
}
