# NevOut Meds: pilot security go / no-go

- **Date:** 2026-10-04
- **Production baseline audited:** `main` @ `fe17a10`
- **Remediation branch:** `security/final-pilot-audit`. Code head is `b358c04`; the documentation commit follows it.
- **Details:**
  - [FINAL_SECURITY_AUDIT_REPORT.md](FINAL_SECURITY_AUDIT_REPORT.md)
  - [SECURITY_FINDINGS_REGISTER.md](SECURITY_FINDINGS_REGISTER.md)

## Verdict: **B — CONDITIONAL GO**

No exploitable P0 was found. Tenant isolation, the capability model, MFA enforcement, offline replay safety and the staff lifecycle all held under adversarial testing.

**One P1 (SA-01) must be closed before real pilot data enters production.** The fix is migration `0022`. It is written, tested, and has been proven to close the issue, but it is **not applied**: applying a production migration needs your authorisation.

The existing **backup and restore hard gate** also still applies.

When `0022` is applied to production, and the backup gate is closed before the first real data, the security position moves to **A — GO**, with only the documented operational gates remaining.

### Conditions to clear before real pilot data

1. **Apply `0022_final_security_audit.sql` to production** (closes SA-01, plus SA-02, SA-03 and SA-04). Owner authorisation is required. Afterwards:
   - re-run `supabase migration list --linked`;
   - re-run the SQL suite against a fresh build;
   - optionally run the read-only check `has_column_privilege('authenticated','public.customers','credit_balance','UPDATE') = false` in the SQL editor.
2. **The backup and restore hard gate:** an encrypted off-site backup scheduled, and one restore test completed (`PILOT_GO_LIVE_CHECKLIST.md` #1).

### Strongly recommended before activation

These are not blocking.

- Deploy the branch frontend: security headers, sign-out device clean-up, CSV, import and document fixes. Then verify with `curl -D - https://nevoutmeds.com/`.
- Disable public signup for the pilot (NV-AUTH-01).
- Trim the production CORS allow-list to `https://nevoutmeds.com` (NV-CORS-01).
- Set the Sentry DSN and alert delivery.
- Commission legal review of the privacy notice, terms and customer-data handling (NV-PRIV-01/02).

---

## P0 findings

None.

## P1 findings

| ID | Finding | Status |
|---|---|---|
| SA-01 | Any team member can rewrite customer `credit_balance`, `total_spend`, `visit_count` and `last_visit` through PostgREST, with no audit trail. Confirmed by probe. | Fix ready in `0022`. **Awaiting authorisation.** |

## P2 findings

| ID | Finding | Status |
|---|---|---|
| SA-02 | Idempotent replay returns a stored result before authorising the caller | Fix ready (`0022`) |
| SA-03 | Pending (including owner-role) invitations outlive the inviter's suspension or demotion | Fix ready (`0022`) |
| NV-OFF-01 | Sign-out left cached pharmacy and customer data in IndexedDB | **Fixed** (branch) |
| NV-EXP-01 | CSV formula injection in exports | **Fixed** (branch) |
| NV-IMP-01 | "Update existing" import reset fields absent from the file | **Fixed** (branch) |
| NV-IMP-02 | Case-variant duplicate product names | Open (needs a migration and a data check) |
| NV-HDR-01 | No CSP, anti-framing or nosniff headers in production | **Fixed** (branch). Deploy needs authorisation. |
| NV-AUTH-01 | Public owner signup is enabled in production | Owner decision (auth config) |
| NV-DOC-01 | Placeholder "download" saved under the document's real file name | **Fixed** (branch) |
| NV-COPY-01 | "Recorded sales rate" used for a hand-entered value | **Fixed** (branch) |
| NV-PRIV-01 | No privacy notice or terms | Owner action / legal |
| NV-PRIV-02 | Health-inferable customer data with no notice, consent or deletion path | Owner action / legal |

## P3 findings

The register lists these in full: SA-04 (fixed in `0022`), SA-05..SA-10, NV-MFA-01, NV-CORS-01, NV-DEMO-01, NV-OPS-01 (fixed), NV-TEL-01 (fixed), NV-IMP-03..05, NV-DOC-02/03, NV-COPY-02 and NV-DEP-01.

## Deferred gates

| Gate | Blocks real data? |
|---|---|
| Independent encrypted backup plus a **tested restore** | **Yes. Known pre-pilot hard gate.** |
| Sentry | No. Immediately-before-activation task. |
| SMTP | No. Operator provisioning is the pilot path. |
| WhatsApp API / support number | No. No delivery is claimed anywhere. |
| Supabase Pro / PITR | No |

## Legal-review items

These are not decided here, and no legal text was invented.

- Data-protection applicability per launch country:
  - Liberia
  - Ghana (DPA 2012)
  - Nigeria (NDPA 2023)
  - Kenya (DPA 2019)
  - Tanzania (PDPA 2022)
  - others in the registry
- NevOut's role as processor or controller toward pharmacies.
- Cross-border hosting: Supabase is in West EU (Ireland).
- The privacy notice, terms, and the customer notice and consent wording.
- Retention and deletion of customer records.
- Platform-admin access to health-inferable fields.
- Vendor DPAs.

**HIPAA was not assumed, and nothing claims it.**

## Not-applicable sections

| Section | Why it does not apply |
|---|---|
| AI/LLM security | The Analyst is deterministic, with no model provider. |
| Payments, subscriptions, auto-renewal | There is no checkout or billing code. |
| COPPA | B2B staff tool. |
| Email marketing compliance | Transactional auth email only, and SMTP is deferred. |
| SMS | Not used. |
| DMCA | No public user-generated content. |
| FCRA, political/campaign | Not this product. |
| Nginx / ModSecurity / Fail2ban | Managed Vercel and Supabase edge. |
| CSRF | Bearer tokens, not cookies. |
| Server-side SSRF and command injection | No server code fetches or executes user input. |

---

## Tests executed

| Suite | Environment | Result |
|---|---|---|
| Fresh-database migrations `0001`–`0022` plus SQL suites 10–80 (`run_local_validation.sh`) | Disposable local database | **481 / 481 pass** (451 existing + 30 new) |
| Same, **without** `0022` (baseline proof) | Disposable local database | 14 of the 30 new checks **fail**, as expected; all 451 existing checks pass |
| Adversarial SQL probes (cross-tenant, escalation, replay, concurrency, grants) | Disposable local database (dropped) | See the register. No P0, one P1. |
| `export_import_safety.test.mjs` (new) | Node | **18 / 18** on the branch; **13 fail on `main`** (baseline proof) |
| `capabilities_parity`, `country_config`, `design_tokens`, `sentry_privacy` | Node | 6/6, 101/101, 27/27, 38/38 |
| TypeScript typecheck (`tsc -b`) and production build (`vite build`, PWA) | Local | Pass. There is one pre-existing warning about a large chunk. |
| `ui_offline_first` (including the new sign-out and device-cache checks) | Real Chrome, local build **with the production CSP and headers** | **22 / 22** |
| `ui_import` | Same | **32 / 32** |
| `ui_core_flows` (includes axe WCAG checks) | Same, fresh fixtures | **81 / 81**. `main` comparison: 81/81. |
| `ui_mfa` | Same, fresh fixtures | **43 / 43** (twice). `main` comparison: 43/43. |
| `ui_staff_lifecycle` | Same | **17 / 17** |
| `ui_foundation` | Same | **55 / 55** |
| `ui_recovery` | Same | **26 / 26** |
| `ui_offline_sale_stock` | Same | **25 / 25** |
| `pwa_routes_check` | Same | The service worker activates and controls every route, with no errors. |
| CSP violation reporting across all UI runs | Report-only twin of the enforced policy | **0 violations from the app.** The two reports logged were deliberate probes, both blocked. |
| `api_tenant_isolation` | Local API with `0022` applied | **41 / 41** |
| `api_mfa` | Same | **35 / 35** |
| `api_staff_lifecycle` | Same | **47 / 47** |
| `api_realtime_offline` | Same | **25 / 25** |
| `api_cors_origins` | **Production, signed out** (creates and changes nothing) | **24 / 24**, with 3 authenticated checks skipped by design |
| `api_cors_origins` | Local | Status codes are correct, but header assertions fail because the local CLI Kong gateway adds a blanket `*`. This is a documented local-environment limitation that hosted Supabase does not share; production was verified directly. |
| MFA reset downgrades the target's session | Local GoTrue v2.197.0 (same as production) | Next refresh is `aal1`. The pre-reset access token stays `aal2` for at most 1 h. |
| `npm audit` / `npm audit --omit=dev` | — | 4 total (1 high, 3 moderate). Shipping code has only the 2 moderate React Router advisories, already assessed as mitigated or not applicable (`docs/DEPENDENCY_SECURITY.md`). The rest are dev-only. |
| `gitleaks` over full history (57 commits; public repository) | — | 1 hit: a deliberate fake JWT fixture (`sentry_privacy.test.mjs`). No real secrets. |

Three runs failed and are excluded from the results above:
- **First UI attempts:** Chrome could not start (a harness first-run race, now fixed).
- **First CSP `ui_mfa` run:** fixtures were contaminated by earlier aborted runs. It passed on re-seeded fixtures, twice.
- **No-CSP `ui_mfa` run on port 4179:** that port is not in the local staff-admin CORS allow-list, so the function correctly refused it.

**Not executed:**
- Semgrep and CodeQL: not installed on this machine.
- The Cloudflare `security-audit` skill: not present at `.claude/skills/security-audit/` or `~/.claude/skills`.
- Load and stress tests against production: prohibited by the audit rules. Concurrency was probed locally instead.
- Backup and restore: this is the deferred hard gate.
- Vercel Firewall and dashboard inspection: the Vercel MCP needs authorisation (`/mcp`).

## Production checks executed

All read-only or non-destructive.

| Check | Result |
|---|---|
| Response headers (`/`, `/platform`, `/sw.js`, `/.env`, legacy alias) | HSTS only. No CSP, XFO or nosniff (NV-HDR-01). `/.env` returns the SPA shell. |
| Redirects | `http://` and `www.` both 308-redirect to `https://nevoutmeds.com` |
| Public auth settings | Email provider only, `disable_signup:false`, `mailer_autoconfirm:false` |
| staff-admin CORS | Allow-listed origins are echoed; unknown, look-alike and `null` origins get 403 from the function; the unauthenticated 401 with `*` is the platform gateway. |
| `supabase migration list --linked` | `0001`–`0021` remote, matching the repo (`0022` is not applied) |
| `supabase functions list` / `download` | `staff-admin` v7 ACTIVE. The deployed source is semantically identical to the repo. |
| `supabase secrets list` (names only) | Includes `NEVOUT_ALLOWED_APP_ORIGINS` and `NEVOUT_APP_ORIGIN`. No values were read. |
| Production bundle scan (44 chunks) | Only the anon JWT. No service key, `sb_secret_`, third-party script or remote font. |
| Signed-out browser smoke | `/platform` and `/admin` redirect to sign-in. No IndexedDB or localStorage data while signed out. No console errors. The invite page renders without a valid token. |

The demo tenant was not touched, and no production tenant, user or row was created or modified.

## Files changed

On branch `security/final-pilot-audit`:

- **Client:**
  - `client/src/platform/auth/AuthProvider.tsx`
  - `client/src/platform/offline/{db.ts,session.ts,SyncProvider.tsx}`
  - `client/src/platform/utils/csv.ts` (new)
  - `client/src/platform/features/reports/charts.jsx`
  - `client/src/platform/features/documents/{exports.ts,DocumentsScreen.jsx}`
  - `client/src/platform/import/rows.ts`
  - `client/src/platform/features/{analytics/insights.ts,expiry/ExpiryScreen.jsx,inventory/InventoryScreen.jsx,inventory/model.ts}`
- **Edge:** `vercel.json`
- **Ops:** `ops/provision/provision-owner.mjs`, `ops/security/reset-mfa.mjs`
- **Tests:**
  - `supabase/tests/80_final_security_audit.test.sql` (new)
  - `supabase/tests/export_import_safety.test.mjs` (new)
  - `supabase/tests/ui_offline_first.e2e.mjs`
  - Chrome launch harness: `lib/harness.mjs`, `ui_foundation`, `ui_offline_sale_stock`, `ui_phase8_correctness`, `ui_recovery`, `ui_staff_lifecycle`, `ui_workflows`, `ux_audit`
- **Docs:** this file, `FINAL_SECURITY_AUDIT_REPORT.md`, `SECURITY_FINDINGS_REGISTER.md`

## Migrations changed

- **Added:** `supabase/migrations/0022_final_security_audit.sql`. **It is not applied to production.**
- It was applied to the **local** development database only, so the UI and API suites could run against it.
- No existing migration was modified.

## Deployed configuration changed

**None.** No change was made to:
- the Supabase schema, auth settings, secrets or Edge Functions
- Vercel project settings or deployments
- DNS
- production data

Existing release tags were not moved, and no new tag was created.

## Commit SHAs (branch `security/final-pilot-audit`, on top of `fe17a10`)

| SHA | Change |
|---|---|
| `faca1d3` | fix(offline): device data clean-up on session end; telemetry minimisation |
| `7780616` | fix(export, import): CSV encoder, import field preservation, honest document details |
| `0f224ca` | copy: "entered sales rate" |
| `598903e` | db: **PROPOSED** migration `0022` plus SQL regression suite |
| `427fadd` | edge: security response headers |
| `155355b` | ops: target project in operator audit logs |
| `b358c04` | test(harness): Chrome first-run and page-target race |
| *(next)* | docs: audit report, findings register, this go/no-go |

**Not merged into `main`, not deployed, not tagged.** Per the release discipline, the next pilot-ready tag waits until:
- `0022` is applied and verified in production;
- the branch is reviewed, merged and deployed, with the production header check passing;
- the backup gate is closed.
