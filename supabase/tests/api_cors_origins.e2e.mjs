// NevOut Meds — browser-origin allow-list of the staff-admin Edge Function.
//
// The function echoes only allow-listed origins (NEVOUT_ALLOWED_APP_ORIGINS), never
// "*", and refuses any other browser origin outright. Authentication and
// authorization are unchanged: CORS never substitutes for the bearer token.
//
// Usage:
//   NEVOUT_API_URL=<supabase url> NEVOUT_ANON_KEY_FILE=<file> \
//   NEVOUT_ALLOWED_ORIGINS="https://nevoutmeds.com,https://nevout-meds-liberia-pilot.vercel.app" \
//     node supabase/tests/api_cors_origins.e2e.mjs
// "Signed out" means what the browser sends when nobody is signed in: the anon key
// as the bearer token.
// Locally (default API), the seeded E2E owner is used for the authenticated checks.
// Against production no account exists, so those checks are skipped (signed-out
// and unknown-origin checks still run). Nothing is created or changed.
import fs from "node:fs";
import { readIds, signInFull } from "./lib/mfa.mjs";

const API = (process.env.NEVOUT_API_URL || "http://127.0.0.1:55421").replace(/\/$/, "");
const ANON = fs.readFileSync(process.env.NEVOUT_ANON_KEY_FILE || "/tmp/nevout_anon.jwt", "utf8").trim();
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API);
const ALLOWED = (process.env.NEVOUT_ALLOWED_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://127.0.0.1:4178,http://127.0.0.1:4180")
  .split(",").map((s) => s.trim()).filter(Boolean);
const DENIED = (process.env.NEVOUT_DENIED_ORIGINS || "https://evil.example,https://nevoutmeds.com.evil.example,https://evilnevoutmeds.com,http://nevoutmeds.com,https://www.nevoutmeds.com,null")
  .split(",").map((s) => s.trim()).filter((o) => o && !ALLOWED.includes(o));
// NEVOUT_FUNCTION_URL reaches the function directly. Locally this is needed because the
// CLI's Kong gateway adds its own blanket CORS plugin in front of /functions/v1
// (hosted Supabase does not), which would hide the function's behaviour.
const FN = (process.env.NEVOUT_FUNCTION_URL || `${API}/functions/v1/staff-admin`).replace(/\/$/, "");

let pass = 0, fail = 0, skip = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`ok   ${name}${detail ? ` [${detail}]` : ""}`); }
  else { fail++; console.log(`FAIL ${name} [${detail}]`); }
};
const skipped = (name, why) => { skip++; console.log(`skip ${name}: ${why}`); };

async function call({ method = "POST", origin, token, body, preflight = false }) {
  const headers = { apikey: ANON };
  if (origin) headers.Origin = origin;
  if (preflight) Object.assign(headers, { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, apikey, content-type, x-client-info" });
  else headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(FN, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, acao: r.headers.get("access-control-allow-origin"), vary: r.headers.get("vary") ?? "", acam: r.headers.get("access-control-allow-methods") ?? "", acah: r.headers.get("access-control-allow-headers") ?? "", json };
}

let token = null;
if (LOCAL) {
  const ids = readIds();
  if (ids.password) token = (await signInFull(API, ANON, "ownerA@e2e.local", ids.password)).access_token;
}
console.log(`# ${API} · allowed: ${ALLOWED.join(", ")} · denied: ${DENIED.join(", ")} · authenticated checks: ${token ? "yes" : "no"}`);
const seen = [];

for (const origin of ALLOWED) {
  const pf = await call({ method: "OPTIONS", origin, preflight: true }); seen.push(pf.acao);
  check(`${origin}: preflight succeeds and echoes exactly this origin`, pf.status === 200 && pf.acao === origin && /\bOrigin\b/.test(pf.vary) && /POST/.test(pf.acam) && /authorization/.test(pf.acah), `${pf.status} ${pf.acao}`);
  const out = await call({ origin, token: ANON, body: { action: "probe" } }); seen.push(out.acao);
  check(`${origin}: signed-out request is denied (401), readable by the app`, out.status === 401 && out.acao === origin, `${out.status}`);
  const bad = await call({ origin, token: "not-a-jwt", body: { action: "probe" } }); seen.push(bad.acao);
  check(`${origin}: a forged bearer token is denied (401)`, bad.status === 401, `${bad.status}`);
  if (token) {
    const ok = await call({ origin, token, body: { action: "cors_probe" } }); seen.push(ok.acao);
    check(`${origin}: authenticated request reaches the function (unknown action → 400)`, ok.status === 400 && /unknown action/.test(ok.json?.error ?? "") && ok.acao === origin, `${ok.status} ${ok.json?.error ?? ""}`);
    const authz = await call({ origin, token, body: { action: "reset_mfa", user_id: "00000000-0000-0000-0000-000000000000" } }); seen.push(authz.acao);
    check(`${origin}: authorization is still decided by the database (reset of a non-member refused)`, authz.status === 403 && authz.acao === origin, `${authz.status} ${authz.json?.error ?? ""}`);
  } else skipped(`${origin}: authenticated request`, "no session against this project (production holds no accounts)");
}

for (const origin of DENIED) {
  const pf = await call({ method: "OPTIONS", origin, preflight: true }); seen.push(pf.acao);
  check(`${origin}: preflight is rejected with no CORS grant`, pf.status === 403 && pf.acao === null, `${pf.status} ${pf.acao}`);
  const post = await call({ origin, token: token ?? "not-a-jwt", body: { action: "cors_probe" } }); seen.push(post.acao);
  check(`${origin}: request is refused before any action (403 origin not allowed)`, post.status === 403 && post.json?.error === "origin not allowed" && post.acao === null, `${post.status} ${post.json?.error ?? ""}`);
}

const none = await call({ token: ANON, body: { action: "probe" } }); seen.push(none.acao);
check("no Origin (operator tools): signed-out request is denied (401), no CORS headers", none.status === 401 && none.acao === null, `${none.status}`);
if (token) {
  const op = await call({ token, body: { action: "cors_probe" } }); seen.push(op.acao);
  check("no Origin (operator tools): authenticated request still works", op.status === 400 && /unknown action/.test(op.json?.error ?? ""), `${op.status}`);
}
check("no response ever grants Access-Control-Allow-Origin: *", !seen.includes("*"), [...new Set(seen.map(String))].join(", "));

console.log(`\n# ${pass + fail} CORS checks, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
