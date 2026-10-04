// NevOut Meds — public self-service sign-up stays removed from the client (no browser, no DB).
//
// Production has Supabase Auth `disable_signup = true` (2026-10-04). Owners are provisioned and
// staff join by invitation, so the app must not call auth.signUp or advertise a sign-up path
// that would only fail. Static check over client/src.
//
// Usage: node supabase/tests/public_signup_disabled.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "client/src");
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p); } })(SRC);

let n = 0, failed = 0;
const check = (d, ok, detail = "") => { n++; if (!ok) failed++; console.log(`${ok ? "ok" : "not ok"} ${n} - ${d}${detail ? ` [${detail}]` : ""}`); };
const hits = (re) => files.flatMap((f) => fs.readFileSync(f, "utf8").split("\n").map((l, i) => (re.test(l) ? `${path.relative(ROOT, f)}:${i + 1}` : null)).filter(Boolean));

check("no client code calls supabase auth.signUp", hits(/\.auth\.signUp\s*\(/).length === 0, hits(/\.auth\.signUp\s*\(/).join(", "));
check("no 'Create an account' / 'Create my account' / 'Create account' call to action", hits(/Create (an |my )?account/i).length === 0, hits(/Create (an |my )?account/i).join(", "));
check("no 'Sign up' call to action", hits(/>\s*Sign ?up\b|"Sign ?up"|'Sign ?up'/i).length === 0, hits(/>\s*Sign ?up\b|"Sign ?up"|'Sign ?up'/i).join(", "));
check("AuthProvider exposes no sign-up method", !/signUp(Owner|ForInvitation)/.test(fs.readFileSync(path.join(SRC, "platform/auth/AuthProvider.tsx"), "utf8")));
const help = fs.readFileSync(path.join(SRC, "platform/auth/NoAccountHelp.tsx"), "utf8");
check("the no-account help uses the configured support address, not a hard-coded one", /SUPPORT_EMAIL/.test(help) && !/@[a-z0-9-]+\.[a-z]/i.test(help.replace(/mailto:\$\{SUPPORT_EMAIL\}/, "")));
check("login and invitation pages render the no-account help", ["pages/LoginPage.tsx", "pages/AcceptInvitePage.tsx"].every((p) => /<NoAccountHelp\b/.test(fs.readFileSync(path.join(SRC, p), "utf8"))));

console.log(`\n# ${n} public-sign-up checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
