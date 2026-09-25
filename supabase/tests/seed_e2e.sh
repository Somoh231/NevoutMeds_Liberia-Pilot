#!/usr/bin/env bash
# Seeds the LOCAL Supabase stack with two pharmacies and real auth users.
#
# Users are created through the GoTrue admin API, never with raw SQL inserts:
# hand-inserted auth.users rows leave columns like confirmation_token and
# created_at NULL, which GoTrue cannot scan (it fails the whole login with
# "converting NULL to string is unsupported"). This is what made local password
# sign-in return 500/502 before Phase 4.
#
# Usage: supabase/tests/seed_e2e.sh
set -euo pipefail

API="${NEVOUT_API_URL:-http://127.0.0.1:55421}"
CONTAINER="${NEVOUT_DB_CONTAINER:-supabase_db_NevOutMeds_Liberia_Pilot}"
JWT_SECRET="${NEVOUT_JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
PASSWORD="${NEVOUT_TEST_PASSWORD:-PilotTest123!}"

mint() { # $1 = role
  node -e '
    const c = require("crypto");
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const h = b({ alg: "HS256", typ: "JWT" });
    const n = Math.floor(Date.now() / 1000);
    const p = b({ iss: "supabase", role: process.argv[1], iat: n, exp: n + 8 * 3600 });
    const s = c.createHmac("sha256", process.argv[2]).update(h + "." + p).digest("base64url");
    process.stdout.write(`${h}.${p}.${s}`);
  ' "$1" "$JWT_SECRET"
}

ANON="$(mint anon)"
SERVICE="$(mint service_role)"
echo "$ANON" > /tmp/nevout_anon.jwt
( umask 077; echo "$SERVICE" > /tmp/nevout_service.jwt ); chmod 600 /tmp/nevout_service.jwt

create_user() { # $1 = email -> prints uuid
  curl -s -m 30 -X POST "$API/auth/v1/admin/users" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"email_confirm\":true}" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);if(!j.id){console.error("failed to create "+process.argv[1]+": "+JSON.stringify(j).slice(0,200));process.exit(1)}process.stdout.write(j.id)})' "$1"
}

psql_q() { docker exec -i "$CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 -d postgres "$@"; }

echo "== removing previous e2e users"
EXISTING=$(curl -s -m 30 "$API/auth/v1/admin/users?per_page=200" -H "apikey: $ANON" -H "Authorization: Bearer $SERVICE" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);(j.users||[]).filter(u=>/@e2e\.local$/.test(u.email)).forEach(u=>console.log(u.id))})')
for uid in $EXISTING; do
  curl -s -m 30 -X DELETE "$API/auth/v1/admin/users/$uid" -H "apikey: $ANON" -H "Authorization: Bearer $SERVICE" >/dev/null
done

echo "== creating auth users"
OWNER_A=$(create_user "ownerA@e2e.local")
STAFF_A=$(create_user "staffA@e2e.local")
OWNER_B=$(create_user "ownerB@e2e.local")

echo "== seeding tenants"
psql_q -c "
truncate public.pharmacies cascade;
insert into public.pharmacies (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'E2E Pharmacy A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'E2E Pharmacy B');
insert into public.users_profiles (id, pharmacy_id, role, name, email) values
  ('$OWNER_A', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner', 'Owner A', 'ownerA@e2e.local'),
  ('$STAFF_A', 'aaaaaaaa-0000-0000-0000-000000000001', 'staff', 'Staff A', 'staffA@e2e.local'),
  ('$OWNER_B', 'bbbbbbbb-0000-0000-0000-000000000002', 'owner', 'Owner B', 'ownerB@e2e.local');
insert into public.customers (id, pharmacy_id, phone, first_name, last_name) values
  ('cccccccc-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', '+2310001', 'Ada', 'A'),
  ('cccccccc-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', '+2310002', 'Ben', 'B');
insert into public.suppliers (id, pharmacy_id, name) values
  ('11111111-aaaa-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Supplier A'),
  ('22222222-bbbb-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Supplier B');
insert into public.products (id, pharmacy_id, name, category, unit_cost, selling_price) values
  ('dddddddd-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Para A', 'Analgesic', 0.5, 1),
  ('dddddddd-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'Para B', 'Analgesic', 0.5, 1);
insert into public.inventory (pharmacy_id, product_id, stock) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-00000000000a', 30),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-00000000000b', 30);
"

cat > /tmp/nevout_e2e_ids.json <<JSON
{
  "ownerA": "$OWNER_A",
  "staffA": "$STAFF_A",
  "ownerB": "$OWNER_B",
  "pharmacyA": "aaaaaaaa-0000-0000-0000-000000000001",
  "pharmacyB": "bbbbbbbb-0000-0000-0000-000000000002",
  "password": "$PASSWORD"
}
JSON

chmod 600 /tmp/nevout_e2e_ids.json

# Owners must use a second factor (0020). Enroll a TOTP authenticator for each
# synthetic owner through Supabase Auth, the same API the app uses, and keep the
# secrets next to the password (local synthetic accounts only; file is chmod 600).
# Set NEVOUT_E2E_NO_MFA=1 to leave the owners without a factor (enrollment tests).
if [ "${NEVOUT_E2E_NO_MFA:-}" != "1" ]; then
  NEVOUT_API_URL="$API" node --input-type=module -e '
    import fs from "node:fs";
    import { passwordSession, enrollTotp, verifyTotp } from "'"$(cd "$(dirname "$0")" && pwd)"'/lib/mfa.mjs";
    const api = process.env.NEVOUT_API_URL;
    const anon = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
    const ids = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
    ids.totp = {};
    for (const email of ["ownerA@e2e.local", "ownerB@e2e.local"]) {
      const s = await passwordSession(api, anon, email, ids.password);
      const f = await enrollTotp(api, anon, s.access_token, "E2E authenticator");
      const v = await verifyTotp(api, anon, s.access_token, f.id, f.secret);
      if (!v.session) throw new Error("could not verify the E2E factor for " + email);
      ids.totp[email] = f.secret;
    }
    fs.writeFileSync("/tmp/nevout_e2e_ids.json", JSON.stringify(ids, null, 2), { mode: 0o600 });
  '
  chmod 600 /tmp/nevout_e2e_ids.json
fi

echo "== done"
# Never print the TOTP secrets.
node -e 'const d=JSON.parse(require("fs").readFileSync("/tmp/nevout_e2e_ids.json","utf8")); if (d.totp) d.totp=Object.fromEntries(Object.keys(d.totp).map(k=>[k,"(enrolled)"])); console.log(JSON.stringify(d,null,2))'
