# NevOut Meds: pilot security go / no-go

- **Date:** 2026-10-04 (closeout)
- **Production:**
  - `main` @ `b60423f`, deployed on Vercel;
  - Supabase `qohpyeqyveusnxhnbtxz` with migrations `0001`–`0022`;
  - public sign-up disabled.
- **Post-closeout cleanup:** branch `chore/post-security-closeout`, adding:
  - sign-up UX removal;
  - NV-IMP-02, with migration `0023` proposed and **not applied**;
  - NV-LEAD-01/02 validation;
  - NV-LEAD-02 fix, with migration `0024` proposed and **not applied**;
  - these documents.
- **Details:**
  - [FINAL_SECURITY_AUDIT_REPORT.md](FINAL_SECURITY_AUDIT_REPORT.md)
  - [SECURITY_FINDINGS_REGISTER.md](SECURITY_FINDINGS_REGISTER.md)

## Verdict: **A — GO FOR SECURITY**

No P0 or P1 finding is open.
- The audit's only P1 (SA-01) and the three findings bundled with it (SA-02, SA-03, SA-04) are **fixed in production** by `0022`. It was applied and verified on 2026-10-04.
- Security headers and CSP are live.
- The offline sign-out fix (NV-OFF-02) and the URL-session-swap fix (NV-AUTH-02) are deployed and verified in production.
- Public self-service sign-up is disabled.

Tenant isolation, the capability model, MFA enforcement, offline replay safety and the staff lifecycle all held under adversarial testing.

> **This verdict does not authorise real pharmacy, customer or patient data.** Until every gate below is closed, production holds only the permanent synthetic demo tenant and short-lived synthetic test data.

### Pre-real-data gates (deferred, all mandatory before the first real data)

1. **Permanent backup with a successful restore test.** This means an independent, encrypted, off-site, scheduled backup and one restore test from a scheduled artefact (`PILOT_GO_LIVE_CHECKLIST.md` #1). The restore test must also prove both of these:
   - every owner and admin still has their MFA factor, or is under supervised re-enrolment (**NV-LEAD-01a**, confirmed P2);
   - suspensions, removals, invitation revocations and bans made after the snapshot are reapplied (**NV-LEAD-01b**, deferred operational risk).
2. **NV-OPS-02:** the backup and restore scripts must stop putting the database password on process command lines.
3. **Sentry:** DSN set and alert delivery configured.
4. **Tanzania privacy and regulatory readiness:**
   - PDPA 2022 applicability and registration;
   - privacy notice, terms and customer notice/consent (NV-PRIV-01/02);
   - cross-border hosting.
   These need legal review; no legal text is invented here.

### Recommended before real data (owner decisions; not security-verdict blockers)

- **Authorise migrations `0023` and `0024`.** They are separate migrations, both validated on a fresh database, on the upgrade path and through the full browser suites.
  - `0023` (NV-IMP-02) makes product names case- and spacing-insensitive. Production has 0 products, so nothing conflicts.
  - `0024` (NV-LEAD-02) removes API hard deletes of customers and products, so their sales and stock history cannot be cascaded away without an audit row. Until it is applied, NV-LEAD-02 remains exposed in production; production holds 0 customers and 0 products.
- At activation:
  - trim the production CORS allow-list to `https://nevoutmeds.com` (NV-CORS-01);
  - raise the server-side minimum password length to the app's 8;
  - consider an Auth session time limit.

---

## P0 findings

None.

## P1 findings

| ID | Finding | Status |
|---|---|---|
| SA-01 | Any team member could rewrite customer `credit_balance`, `total_spend`, `visit_count` and `last_visit` through PostgREST, with no audit trail | **Fixed (production)**, `0022`. Production verification: 234/235, with the one difference being the demo pharmacy in an admin count. |

## P2 findings

| ID | Finding | Status |
|---|---|---|
| SA-02 | Idempotent replay returned a stored result before authorising the caller | **Fixed (production)**, `0022` |
| SA-03 | Pending (including owner-role) invitations outlived the inviter's suspension or demotion | **Fixed (production)**, `0022` |
| NV-OFF-01 | Sign-out left cached pharmacy and customer data in IndexedDB | **Fixed (deployed)** |
| NV-OFF-02 | Offline sign-out left the session and cached data on the device | **Fixed (deployed)**. Production check: 29/29. |
| NV-AUTH-02 | A `#access_token` link could swap the signed-in session | **Fixed (deployed)**. Production check: 29/29. |
| NV-EXP-01 | CSV formula injection in exports | **Fixed (deployed)** |
| NV-IMP-01 | "Update existing" import reset fields absent from the file | **Fixed (deployed)** |
| NV-IMP-02 | Product names differing only by case or spacing created duplicate products | **Fix ready, awaiting authorisation.** `0023` is proposed and not applied; client and tests are on the cleanup branch. |
| NV-HDR-01 | No CSP, anti-framing or nosniff headers | **Fixed (deployed)**, verified live |
| NV-AUTH-01 | Public owner sign-up enabled | **Fixed (production)**: `disable_signup = true`. The dead sign-up screens are removed on the cleanup branch. |
| NV-DOC-01 | Placeholder "download" saved under the document's real file name | **Fixed (deployed)** |
| NV-COPY-01 | "Recorded sales rate" used for a hand-entered value | **Fixed (deployed)** |
| NV-LEAD-01a | A restore drops MFA factors, so a password alone then reaches aal2 | **Confirmed**, open. Backup gate (#1 above). |
| NV-LEAD-02 | An owner's raw API DELETE erased sales and stock history, with no audit | **Closed (code)**, by `0024`. Validated; production apply awaits authorisation. |
| NV-OPS-02 | Database password on the backup scripts' command lines | Open. Backup gate (#2 above). |
| NV-PRIV-01 | No privacy notice or terms | Owner action / legal |
| NV-PRIV-02 | Health-inferable customer data with no notice, consent or deletion path | Owner action / legal |

**Deferred operational risk (not a severity):** NV-LEAD-01b. A restore rolls back revocations made after the snapshot. It is covered by gate #1.

## P3 findings

The register lists these in full:
- SA-04 (fixed in production, `0022`)
- SA-05..SA-10
- NV-MFA-01
- NV-CORS-01
- NV-DEMO-01
- NV-OPS-01 (fixed, deployed)
- NV-TEL-01 (fixed, deployed)
- NV-IMP-03..05
- NV-DOC-02/03
- NV-COPY-02
- NV-DEP-01

## Legal-review items

These are not decided here, and no legal text was invented.

- Data-protection applicability per launch country:
  - Liberia
  - Ghana (DPA 2012)
  - Nigeria (NDPA 2023)
  - Kenya (DPA 2019)
  - **Tanzania (PDPA 2022): pre-real-data gate for Tanzania**
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

## Validation record

### Audit (2026-10-04, branch `security/final-pilot-audit`)

The full table is in `FINAL_SECURITY_AUDIT_REPORT.md` §D. In summary:
- **SQL:** 481/481 on a fresh database with `0022`; 14 of the new checks fail without it.
- **Node:** 190/190.
- **Real-Chrome UI:** 301/301 across 8 suites, against a local build with the production CSP, and 0 CSP violations from the app.
- **API:** 148/148 locally.
- **Production CORS:** 24/24, signed out.

### Production remediation (2026-10-04)

| Check | Result |
|---|---|
| `0022` applied | Production now lists `0001`–`0022` |
| SQL suites 10/40/70/80 plus import checks, run inside one rolled-back transaction with synthetic data only | 234/235. The one difference is environmental: the permanent demo pharmacy in an admin count. |
| Read-only post-checks | The `0022` objects are present; RLS is on for 22/22 tables; anon has 0 grants; the documents bucket has its 4 policies |
| Demo tenant snapshot before and after | Identical |
| Security headers and CSP | Live on `nevoutmeds.com` and the legacy domain, with 0 violations signed in or out |
| CORS | 24/24 |
| MFA, recovery and setup links, provisioning, staff invitation (live proof) | 44/44 |
| Support email | 19/19 |
| NV-OFF-02 and NV-AUTH-02 in real Chrome against production, with synthetic owners, cleaned up | 28/28 before the sign-up change; 29/29 after |
| Public sign-up disabled | An anonymous sign-up returns `422 signup_disabled`. Only `disable_signup` changed in the auth config. |

### Post-closeout cleanup (branch `chore/post-security-closeout`)

Tests ran against the local stack. The UI suites ran in real Chrome against a local build served with the production headers and CSP (Supabase host swapped to the local stack).

| Suite | Result |
|---|---|
| `tsc -b` and production `vite build` (PWA) | Pass. The production bundle references only `qohpyeqyveusnxhnbtxz`. |
| Node: `public_signup_disabled` (new), `auth_session_security`, `export_import_safety`, `capabilities_parity`, `country_config`, `design_tokens`, `sentry_privacy` | **230 / 230**. `public_signup_disabled`: 4 of 6 fail on the pre-change code. |
| Fresh database, migrations `0001`–`0023`, SQL suites 10–81 | **23/23 migrations; 505 / 505 checks** (481 existing + 24 new) |
| The same run **without** `0023` | 14 of the 24 new checks fail, as expected; all 481 existing checks pass |
| `0023` upgrade path: a `0001`–`0022` database holding real case and spacing collisions | Refused atomically, leaving no objects and no name changes. Applied cleanly once the collisions were resolved, normalising whitespace and NBSP. Re-applying is idempotent. Afterwards a case variant is refused. |
| API: `api_tenant_isolation`, `api_mfa`, `api_staff_lifecycle`, `api_realtime_offline` | **148 / 148** (41, 35, 47, 25) |
| `ui_foundation`, which now asserts the invite page has no create-account path and shows the no-account help | **56 / 56** |
| `ui_phase8_correctness`, which now asserts the login page has no sign-up and shows the no-account help | **15 / 15** |
| `ui_owner_provisioning` (operator setup link → password → onboarding → MFA set-up) | **12 / 12**, twice |
| `ui_staff_lifecycle` (invitation acceptance) | **17 / 17**, twice |
| `ui_session_security` (offline sign-out; URL-session refusal; signed-out recovery and invitation links still work) | **37 / 37**, twice |
| `ui_recovery` (password recovery) | **26 / 26** on this branch's sign-up change |
| `ui_mfa` | **43 / 43** on this branch's sign-up change |
| `ui_import`, with the 4 new NV-IMP-02 CSV/XLSX checks | **36 / 36** with `0023`. With the trigger and index removed, 3 fail. |
| NV-LEAD-01 and NV-LEAD-02 probes | Both reproduced, twice each |
| CSP violation reports, report-only twin, all runs | **0** |
| Production read-only checks | Headers and CSP live on both domains; `disable_signup: true`; `0022` applied and `0023` not applied; 0 product-name conflicts |

**Environment-blocked runs, since resolved.** The first full browser run was contaminated: the shared local Docker VM (8 GB) had about 100 MB of RAM free and a full swap, with 49 containers from other projects running. In that state the deployed `main` failed the same suites the same way, so the failures were not attributable to this branch.

With the owner's approval, the containers of four other projects were stopped:
- amanah-hunhu
- spendda-local-qa
- pathlift
- ubuywesell

That made 37 containers, and all were restarted afterwards: 37/37 back up, none unhealthy. The VM then had about 4.8 GB available. **Every suite then passed cleanly** (next section).

### NV-LEAD-02 fix (`0024`) and clean revalidation

| Suite | Result |
|---|---|
| `tsc -b` and production `vite build` | Pass. The bundle references only the production project. |
| Node: all 7 `*.test.mjs` | **230 / 230** |
| Fresh database, migrations `0001`–`0024`, SQL suites 10–82 (10 files) | **24/24 migrations; 546 / 546 checks** (505 + 41 new) |
| The same run **without** `0024` | 24 of the 41 new checks fail, plus the updated `30_staff_lifecycle` check, as expected. The rest pass. |
| `0024` upgrade path: local `0001`–`0023` stack holding data | Applies cleanly, changes no data (4 customers, 8 products), and re-applies idempotently |
| API: `api_tenant_isolation`, `api_mfa`, `api_staff_lifecycle`, `api_realtime_offline`, `api_delete_guard` (new) | **163 / 163** (41, 35, 47, 25, 15) |
| `ui_offline_first` | **22 / 22** |
| `ui_offline_sale_stock` | **25 / 25** |
| `ui_core_flows` | **81 / 81** |
| `ui_import` (including the NV-IMP-02 CSV/XLSX checks) | **36 / 36** |
| `ui_session_security` | **37 / 37** |
| `ui_recovery` | **26 / 26** |
| `ui_owner_provisioning` | **12 / 12** |
| `ui_staff_lifecycle` | **17 / 17** |
| `ui_mfa` | **43 / 43** |
| `ui_foundation` | **56 / 56** |
| `ui_phase8_correctness` | **15 / 15** |
| Browser total | **370 / 370**, with **0** CSP violation reports |
| Production, read-only | 0 products, 0 normalised-name collisions, 0 customers; `0022` applied, `0023` and `0024` not applied |

## Changes

- **Code:** see the commits on `chore/post-security-closeout` and `FINAL_SECURITY_AUDIT_REPORT.md` §C2.
- **Migrations:** `0023_product_name_case_insensitive.sql` and `0024_customer_product_delete_guard.sql` were added. Neither is **applied to production**. It was applied only to the local development stack and to disposable local databases. No existing migration was edited.
- **Deployed configuration changed by the cleanup:** none. Nothing changed in:
  - the Supabase schema, auth settings, secrets or Edge Functions;
  - Vercel settings or deployments;
  - DNS;
  - production data.

  The only production access was read-only:
  - a product-name conflict query;
  - `supabase migration list`;
  - response headers;
  - the public auth settings.

  The demo tenant was not touched. No release tag was created or moved.
