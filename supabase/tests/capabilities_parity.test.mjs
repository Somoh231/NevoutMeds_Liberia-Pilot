// NevOut Meds — the capability registry must be identical in the database (the
// authority: private.role_capabilities, private.mfa_policy) and the app
// (client/src/platform/auth/capabilities.ts, which only shapes the UI).
//
// Usage: node supabase/tests/capabilities_parity.test.mjs   (local stack running)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTAINER = process.env.NEVOUT_DB_CONTAINER || "supabase_db_NevOutMeds_Liberia_Pilot";
const src = fs.readFileSync(path.join(ROOT, "client/src/platform/auth/capabilities.ts"), "utf8");

let pass = 0, fail = 0;
const check = (d, ok, detail = "") => { if (ok) { pass++; console.log(`ok   ${d}`); } else { fail++; console.log(`NOT OK ${d} ${detail}`); } };

const listOf = (name) => {
  const m = src.match(new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`cannot find ${name} in capabilities.ts`);
  return [...m[1].matchAll(/"([a-z_.]+)"/g)].map((x) => x[1]);
};
const all = listOf("export const CAPABILITIES");
const staff = listOf("const STAFF");
const ts = {
  staff: new Set(staff),
  owner: new Set(all.filter((c) => c !== "platform.admin")),
  admin: new Set(all)
};
const tsMfa = new Set([...src.match(/MFA_REQUIRED_ROLES[^=]*=\s*new Set<Role>\(\[([^\]]*)\]/)[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]));

const sql = (q) => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", q], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);

const dbAll = new Set(sql("select capability from private.capabilities"));
const dbRoles = {};
for (const line of sql("select role || '|' || capability from private.role_capabilities")) {
  const [role, cap] = line.split("|");
  (dbRoles[role] ??= new Set()).add(cap);
}
const dbMfa = new Set(sql("select role from private.mfa_policy where mfa_required"));

const diff = (a, b) => [...a].filter((x) => !b.has(x));
check("the same capabilities are registered", diff(new Set(all), dbAll).length === 0 && diff(dbAll, new Set(all)).length === 0,
  `app-only: ${diff(new Set(all), dbAll)} db-only: ${diff(dbAll, new Set(all))}`);
for (const role of ["staff", "owner", "admin"]) {
  const db = dbRoles[role] ?? new Set();
  check(`${role}: identical capabilities in app and database (${ts[role].size})`,
    diff(ts[role], db).length === 0 && diff(db, ts[role]).length === 0,
    `app-only: ${diff(ts[role], db)} db-only: ${diff(db, ts[role])}`);
}
check("MFA-required roles are identical", diff(tsMfa, dbMfa).length === 0 && diff(dbMfa, tsMfa).length === 0, `app: ${[...tsMfa]} db: ${[...dbMfa]}`);
check("no application code compares role names outside the registry",
  (() => {
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(e.name)) {
          const rel = path.relative(ROOT, p);
          if (/auth\/(capabilities|roles)\.ts$|domain\.ts$|db\/types\.ts$/.test(rel)) continue;
          const text = fs.readFileSync(p, "utf8");
          if (/role\s*(===|!==)\s*["'](owner|admin|staff)["']|["'](owner|admin|staff)["']\s*(===|!==)\s*[\w.?]*role/.test(text)) offenders.push(rel);
        }
      }
    };
    walk(path.join(ROOT, "client/src"));
    if (offenders.length) console.log("   offenders:", offenders.join(", "));
    return offenders.length === 0;
  })());

console.log(`\n# ${pass + fail} capability parity checks, ${fail} failed`);
process.exit(fail ? 1 : 0);
