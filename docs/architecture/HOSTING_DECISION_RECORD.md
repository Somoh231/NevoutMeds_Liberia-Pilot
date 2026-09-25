# Hosting decision record: stay on Vercel + Supabase

- **Status:** Accepted.
- **Date:** 2026-09-25 (Phase 11).
- **Decision:** **Keep** Vercel (frontend) + Supabase (database, Auth, Storage, Realtime, Edge
  Functions). **Do not migrate** to Liquid Web, or to any dedicated or self-managed servers, at
  this stage. No infrastructure migration was performed.

## Context

| | Today |
|---|---|
| Frontend | Static React PWA on Vercel: an immutable build per commit, instant rollback, preview deployments |
| Backend | One Supabase project (West EU): Postgres with RLS and the capability model; Auth with TOTP MFA; private Storage; Realtime; one Edge Function |
| Data | No tenant data yet; one controlled Liberian pilot next |
| Team | Very small; no on-call operations team |
| Users | Pharmacy staff on phones over 3G, offline-first |

## Why stay

1. **Operational simplicity.** There are no servers to patch, harden, back up or monitor at the
   OS level. A small team's time goes into the product and the pilot, not infrastructure.
2. **Supabase integration.** The security model *is* Supabase:
   - RLS, `SECURITY DEFINER` RPCs and the capability registry;
   - Auth-signed JWT claims (`aal`) enforcing MFA in the database;
   - Storage policies;
   - Realtime honouring RLS.

   Moving means re-creating and re-proving all of it: 435 SQL checks and hundreds of E2E
   checks.
3. **Offline and PWA architecture.** The app is static and cacheable; the service worker and
   offline queue don't depend on a server runtime. Vercel's CDN is well suited to it, and
   dedicated servers add nothing for a static PWA.
4. **Deployment maturity.** There is a proven procedure (build → verify hash → smoke →
   health) with instant Vercel rollback and additive migrations. Independent logical backups
   already exist, so recoverability doesn't depend on the host (`docs/BACKUP_AND_RECOVERY.md`).
5. **No present requirement** justifies dedicated servers. Nothing today needs data residency,
   a dedicated-infrastructure contract, customer-controlled keys, or scale beyond the managed
   tiers.

## Costs and risks accepted

- Vendor dependence on Supabase and Vercel. This is mitigated by:
  - standard Postgres;
  - independent encrypted backups;
  - migrations in git;
  - a static frontend that can be served from anywhere.
- Managed-tier limits: plan upgrades and PITR are deferred until the pilot or paid customers
  (see the build-completion report).

## Triggers to reconsider

Reopen this decision if any of these becomes true:

| Trigger | Example |
|---|---|
| **Required data residency** | A regulator requires pharmacy or patient data to stay in-country or in a region the providers don't offer |
| **Dedicated-infrastructure contract** | A ministry, NGO or enterprise customer contractually requires single-tenant or dedicated hosting |
| **Enterprise customer mandate** | Security questionnaires requiring controls the managed services can't attest to |
| **HIPAA / BAA needs not satisfiable** | A U.S. launch handling PHI, where a BAA can't be obtained on a suitable plan from every processor, including hosting and monitoring |
| **Scale or cost threshold** | Managed pricing clearly exceeds a self-managed equivalent *including* the operations staff it needs |
| **Customer-controlled encryption** | A customer requires BYOK or HSM key custody that the managed services can't provide |

A reconsideration would compare managed alternatives first (another region or plan,
Supabase's enterprise options) before dedicated servers. It would include a migration and
rollback plan and a full re-run of the security suites.

## Also recorded: Better Stack (not added)

Better Stack is **not** part of Phase 11. It would be a future option for:
- external uptime checks from several regions;
- centralized log retention and search;
- incident paging and on-call;
- a public status page.

Adopt it only if NevOut outgrows the current combination of Sentry (code errors) and
`ops_health` + `health-check.mjs` (domain health, with optional webhook alerts) + backup
heartbeat monitoring.
