// NevOut Meds — monitoring privacy: nothing personal or secret leaves the device.
// Unit tests of client/src/platform/observability/scrub.ts (Node ≥ 22.18 strips
// TypeScript types natively). Usage: node supabase/tests/sentry_privacy.test.mjs
import { isExpectedError, pseudonym, scrubEvent, scrubString, scrubUrl } from "../../client/src/platform/observability/scrub.ts";

let pass = 0, fail = 0;
const check = (d, ok, detail = "") => { if (ok) { pass++; console.log(`ok   ${d}`); } else { fail++; console.log(`NOT OK ${d} ${detail}`); } };

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ";
const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

// ── strings ──────────────────────────────────────────────────────────────────
const s1 = scrubString(`Customer Musu Kollie (musu.kollie@example.com, +231 77 123 4567) failed`);
check("emails are redacted", !/musu\.kollie@example\.com/.test(s1) && /\[email\]/.test(s1), s1);
check("phone numbers are redacted", !/77 123 4567/.test(s1) && /\[number\]/.test(s1), s1);
check("JWTs are redacted", !scrubString(`token ${JWT} rejected`).includes("eyJ"), scrubString(`token ${JWT}`));
check("bearer tokens are redacted", !/abcdef0123456789/.test(scrubString("Authorization: Bearer abcdef0123456789xyz")));
check("TOTP secrets are redacted", !scrubString(`secret ${SECRET}`).includes(SECRET));
check("otpauth URIs are redacted", !/JBSWY3/.test(scrubString(`otpauth://totp/NevOut:owner?secret=${SECRET}&issuer=NevOut`)));
check("service keys are redacted", !/sb_secret_/.test(scrubString("key sb_secret_abcdefghijklmnop")));
check("sensitive query parameters are redacted", !/hunter2|123456|ownerA/.test(scrubString("POST /verify?code=123456&password=hunter2&email=ownerA")));
check("sensitive JSON fields are redacted", !/Kollie|penicillin/.test(scrubString('{"last_name":"Kollie","allergies":"penicillin","id":7}')));
check("ordinary words survive", scrubString("Cannot read properties of undefined (reading 'map')") === "Cannot read properties of undefined (reading 'map')");
check("long strings are truncated", scrubString("x".repeat(5000)).length <= 1001);

// ── URLs ─────────────────────────────────────────────────────────────────────
check("URL query strings and fragments are dropped",
  scrubUrl("https://nevout-meds-liberia-pilot.vercel.app/reset-password?token=abc#access_token=xyz") === "https://nevout-meds-liberia-pilot.vercel.app/reset-password");
check("PostgREST filter values are dropped", !/231/.test(scrubUrl("https://x.supabase.co/rest/v1/customers?phone=eq.%2B231771234567")));

// ── whole events ─────────────────────────────────────────────────────────────
const ev = scrubEvent({
  message: `Sale failed for jallah@example.com`,
  user: { id: "u1", email: "owner@example.com", ip_address: "41.1.2.3" },
  server_name: "device-name",
  request: { url: "https://app/platform?customer=Musu", headers: { Authorization: `Bearer ${JWT}`, Cookie: "sb=1" }, cookies: { sb: "1" }, data: { phone: "+231771234567" }, query_string: "customer=Musu" },
  breadcrumbs: [{ category: "console", message: "customer Musu +231771234567" }, { category: "fetch", data: { url: "https://x/rest/v1/customers?phone=eq.231" } }],
  exception: { values: [{ type: "Error", value: `insert failed: Key (phone)=(+231771234567) already exists; jwt ${JWT}`, stacktrace: { frames: [{ filename: "https://app/assets/index.js?v=1", vars: { customer: "Musu" }, context_line: "const name = 'Musu'", pre_context: ["x"], post_context: ["y"] }] } }] },
  extra: { customerName: "Musu", note: "allergic to penicillin", email: "a@b.co", nested: { access_token: JWT, ok: 1 } },
  contexts: { app: { build: "x" }, auth: { password: "hunter2" } },
  tags: { route: "sales", pharmacy_email: "p@x.co" }
});
const blob = JSON.stringify(ev);
check("the user object is removed", ev.user === undefined);
check("the device/server name is removed", ev.server_name === undefined);
check("breadcrumbs are removed", Array.isArray(ev.breadcrumbs) && ev.breadcrumbs.length === 0);
check("request headers, cookies, body and query are removed", Object.keys(ev.request).join(",") === "url" && ev.request.url === "https://app/platform");
check("frame variables and source lines are removed", ev.exception.values[0].stacktrace.frames.every((f) => !f.vars && !f.context_line && !f.pre_context && !f.post_context));
check("no email survives anywhere in the event", !/@example\.com|a@b\.co|p@x\.co/.test(blob), blob.slice(0, 200));
check("no phone number survives", !/231771234567|\+231/.test(blob));
check("no token survives", !blob.includes("eyJ"));
check("no password survives", !/hunter2/.test(blob));
check("keys that name personal data are redacted in extra/contexts/tags", ev.extra.email === "[redacted]" && ev.contexts.auth.password === "[redacted]" && ev.tags.pharmacy_email === "[redacted]" && ev.extra.nested.access_token === "[redacted]");

// ── expected vs unexpected ───────────────────────────────────────────────────
const expected = [
  ["wrong password", { name: "AuthApiError", status: 400, message: "Invalid login credentials" }],
  ["wrong TOTP code", { name: "AuthApiError", status: 422, code: "mfa_verification_failed", message: "Invalid TOTP code entered" }],
  ["duplicate phone", { code: "23505", message: "duplicate key value violates unique constraint" }],
  ["permission refusal", { code: "42501", message: "only the pharmacy owner can invite staff" }],
  ["Edge Function refusal", { status: 403, message: "only the pharmacy owner can manage staff" }],
  ["sync conflict", { message: "stale version: product changed on another device" }],
  ["validation", { message: "validation failed: quantity must be positive" }],
  ["network drop", { name: "TypeError", message: "Failed to fetch" }],
  ["file too large", { status: 413, message: "Payload too large" }]
];
for (const [label, err] of expected) check(`expected, not reported: ${label}`, isExpectedError(err, true) === true);
check("anything while offline is expected", isExpectedError(new Error("boom"), false) === true);
check("a real bug is reported", isExpectedError(new TypeError("Cannot read properties of undefined (reading 'map')"), true) === false);
check("a server fault is reported", isExpectedError({ status: 500, message: "internal error" }, true) === false);
check("a sync engine failure is reported", isExpectedError(new Error("sync_failed record_sale code=XX000 status=500"), true) === false);

// ── pseudonymous tenant tag ──────────────────────────────────────────────────
const p1 = await pseudonym("aaaaaaaa-0000-0000-0000-000000000001");
const p2 = await pseudonym("aaaaaaaa-0000-0000-0000-000000000001");
const p3 = await pseudonym("bbbbbbbb-0000-0000-0000-000000000002");
check("tenant pseudonym is stable", p1 === p2 && /^[0-9a-f]{12}$/.test(p1), p1);
check("tenant pseudonym differs per pharmacy and does not contain the id", p1 !== p3 && !p1.includes("aaaaaaaa"));

console.log(`\n# ${pass + fail} monitoring privacy checks, ${fail} failed`);
process.exit(fail ? 1 : 0);
