// NevOut Meds — session-security regressions (no browser, no network, no DB).
//
// Runs the app's own client/src/platform/supabaseClient.ts bundled with the
// installed supabase-js (auth-js 2.104), with browser shims and a recording
// fetch stub. Covers the two client findings from the final audit:
//
//   SA-05 URL session swap: a URL carrying #access_token=… must never replace a
//         stored session, and only the email-link routes may consume one.
//   SA-06 offline sign-out: when the server sign-out cannot complete, the session
//         must still be removed from the device (and a reload must not restore it).
//
// Usage: node supabase/tests/auth_session_security.test.mjs
import { build } from "esbuild";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "node_modules/.cache/nv-session-test");
const API = "https://audit-dummy.supabase.co";
const KEY = "sb-audit-dummy-auth-token";

await build({
  entryPoints: [join(ROOT, "client/src/platform/supabaseClient.ts")], bundle: true, format: "esm", platform: "browser",
  outfile: join(OUT, "client.mjs"), logLevel: "error", alias: { "@": join(ROOT, "client/src") },
  define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(API), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("anon-dummy") }
});

let n = 0, failed = 0;
const check = (d, ok, detail = "") => { n++; if (!ok) failed++; console.log(`${ok ? "ok" : "not ok"} ${n} - ${d}${detail ? ` [${detail}]` : ""}`); };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const jwt = (sub, aal = "aal2") => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, aal, role: "authenticated", exp: exp(), session_id: `s-${sub}` })}.sig`;
const VICTIM = "11111111-1111-4111-8111-111111111111";
const ATTACKER = "22222222-2222-4222-8222-222222222222";
const stored = (sub) => JSON.stringify({ access_token: jwt(sub), refresh_token: `rt-${sub}`, token_type: "bearer", expires_in: 3600, expires_at: exp(), user: { id: sub, aud: "authenticated", role: "authenticated" } });
const fragment = (sub, type = "magiclink") => `#access_token=${jwt(sub)}&refresh_token=rt-${sub}&expires_in=3600&expires_at=${exp()}&token_type=bearer&type=${type}`;

let instance = 0;
/** A fresh "page load": new module instance over the given storage and URL. */
async function page(href, storage, { offline = false } = {}) {
  const calls = [];
  const loc = { href };
  const store = storage;
  globalThis.window = {
    location: new Proxy(loc, { get: (t, p) => (p === "hash" ? new URL(t.href).hash : p === "pathname" ? new URL(t.href).pathname : t[p]), set: (t, p, v) => { if (p === "hash") { const u = new URL(t.href); u.hash = v; t.href = u.href; } else t[p] = v; return true; } }),
    history: { state: null, replaceState: (_s, _t, url) => { loc.href = new URL(url, loc.href).href; } },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {}, removeEventListener() {}
  };
  globalThis.localStorage = globalThis.window.localStorage;
  globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push(`${init.method ?? "GET"} ${u.pathname}${u.search}`);
    if (offline) throw new TypeError("Failed to fetch");
    if (u.pathname === "/auth/v1/user") {
      const sub = JSON.parse(Buffer.from(String(init.headers?.Authorization ?? init.headers?.get?.("Authorization") ?? "").split(".")[1] ?? "", "base64url").toString() || "{}").sub;
      return new Response(JSON.stringify({ id: sub, aud: "authenticated", role: "authenticated" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
  };
  const mod = await import(`${pathToFileURL(join(OUT, "client.mjs")).href}?i=${++instance}`);
  const client = mod.getSupabaseClient();
  const events = [];
  client.auth.onAuthStateChange((e, s) => events.push(`${e}:${s?.user?.id?.slice(0, 4) ?? "-"}`));
  const { data } = await client.auth.getSession();
  return { mod, client, user: data.session?.user?.id ?? null, calls, events, href: () => loc.href, store };
}

// ── SA-05: URL session swap ─────────────────────────────────────────────────
for (const path of ["/platform", "/", "/admin", "/import", "/login"]) {
  const s = { [KEY]: stored(VICTIM) };
  const p = await page(`https://app.test${path}${fragment(ATTACKER)}`, s);
  check(`signed-in victim opening an access-token link on ${path} keeps their own session`, p.user === VICTIM, p.user?.slice(0, 8));
  check(`  …the attacker token is never validated or stored (${path})`, !p.calls.some((c) => c.includes("/auth/v1/user")) && !String(s[KEY]).includes(`rt-${ATTACKER}`), p.calls.join(","));
  check(`  …and is removed from the address bar (${path})`, !/access_token/.test(p.href()) && new URL(p.href()).pathname === path, p.href());
  p.client.auth.stopAutoRefresh?.();
}
for (const path of ["/reset-password", "/accept-invite?token=abc", "/onboarding"]) {
  const s = { [KEY]: stored(VICTIM) };
  const p = await page(`https://app.test${path}${fragment(ATTACKER, "recovery")}`, s);
  check(`email-link route ${path.split("?")[0]} never swaps an existing session`, p.user === VICTIM && p.mod.urlSessionRejection?.() === "signed-in", `${p.user?.slice(0, 8)} ${p.mod.urlSessionRejection?.()}`);
  p.client.auth.stopAutoRefresh?.();
}
{
  const s = {};
  const p = await page(`https://app.test/reset-password${fragment(ATTACKER, "recovery")}`, s);
  check("signed out: a recovery / setup link on /reset-password still signs the person in", p.user === ATTACKER && p.calls.filter((c) => c.includes("/auth/v1/user")).length === 1, p.user?.slice(0, 8));
  p.client.auth.stopAutoRefresh?.();
}
{
  const s = {};
  const p = await page(`https://app.test/accept-invite?token=abc${fragment(ATTACKER, "invite")}`, s);
  check("signed out: an invitation email link on /accept-invite still signs the invitee in, keeping ?token", p.user === ATTACKER && new URL(p.href()).searchParams.get("token") === "abc", p.href());
  p.client.auth.stopAutoRefresh?.();
}
{
  const s = {};
  const p = await page(`https://app.test/onboarding${fragment(ATTACKER, "signup")}`, s);
  check("signed out: a sign-up confirmation link on /onboarding still signs the owner in", p.user === ATTACKER);
  p.client.auth.stopAutoRefresh?.();
}
{
  const s = {};
  const p = await page(`https://app.test/platform${fragment(ATTACKER)}`, s);
  check("signed out: ordinary routes never accept a session from the URL", p.user === null && p.mod.urlSessionRejection?.() === "route", `${p.user} ${p.mod.urlSessionRejection?.()}`);
  p.client.auth.stopAutoRefresh?.();
}

{
  // main.tsx screens the URL synchronously before the router reads it.
  const s = { [KEY]: stored(VICTIM) };
  const loc = `https://app.test/platform?screen=sales${fragment(ATTACKER)}`;
  globalThis.window = { location: { href: loc }, history: { state: null, replaceState(_s, _t, url) { globalThis.window.location.href = new URL(url, loc).href; } },
    localStorage: { getItem: (k) => (k in s ? s[k] : null), setItem() {}, removeItem() {} }, addEventListener() {} };
  globalThis.document = { visibilityState: "visible", addEventListener() {} };
  const mod = await import(`${pathToFileURL(join(OUT, "client.mjs")).href}?i=${++instance}`);
  mod.screenUrlSession?.();
  const href = globalThis.window.location.href;
  check("start-up screen removes a refused token before the router runs, keeping other query parameters", !/access_token/.test(href) && href.endsWith("/platform?screen=sales") && mod.urlSessionRejection?.() === "route", href);
}

// ── SA-06: offline sign-out ─────────────────────────────────────────────────
{
  const s = { [KEY]: stored(VICTIM) };
  const p = await page("https://app.test/platform", s, { offline: true });
  check("precondition: the owner is signed in on the device", p.user === VICTIM);
  const { error } = await p.client.auth.signOut();
  check("supabase-js keeps the session when the server sign-out fails offline (the root cause)", !!error && !!s[KEY], error?.name);
  // The app's fallback (AuthProvider.signOut): remove the stored session, then a local-scope sign-out.
  const before = p.calls.length;
  p.mod.clearLocalAuthSession?.();
  await p.client.auth.signOut({ scope: "local" });
  const { data } = await p.client.auth.getSession();
  check("offline fallback: the stored session is gone and getSession is empty", !s[KEY] && !s[`${KEY}-user`] && data.session === null, Object.keys(s).join(","));
  check("offline fallback: makes no network request (nothing to revoke without a connection)", p.calls.length === before, p.calls.slice(before).join(","));
  check("offline fallback: emits SIGNED_OUT so the app clears this device's cached data", p.events.some((e) => e.startsWith("SIGNED_OUT")), p.events.join(","));
  p.client.auth.stopAutoRefresh?.();
  const reload = await page("https://app.test/platform", s, { offline: true });
  check("a reload while still offline does not restore the previous session", reload.user === null);
  reload.client.auth.stopAutoRefresh?.();
  const online = await page("https://app.test/platform", s);
  check("reconnecting does not restore the previous session either", online.user === null);
  online.client.auth.stopAutoRefresh?.();
}
{
  const s = { [KEY]: stored(VICTIM) };
  const p = await page("https://app.test/platform", s);
  const { error } = await p.client.auth.signOut();
  check("online sign-out still revokes on the server and clears the device", !error && !s[KEY] && p.calls.some((c) => c.startsWith("POST /auth/v1/logout")) && p.events.some((e) => e.startsWith("SIGNED_OUT")), p.calls.join(","));
  p.client.auth.stopAutoRefresh?.();
}

console.log(`\n# ${n} session-security checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
