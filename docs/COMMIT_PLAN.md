# NevOut Meds — Commit plan for the hardening work

The working tree holds Phases 1–7. Nothing is committed yet and **nothing will be pushed without
your say-so**. This is the proposed sequence: each commit is coherent on its own and the order keeps
the repository buildable at every step.

Run from the repo root, on a branch (not `main`):

```bash
git checkout -b hardening/phases-1-7
```

| # | Commit | Files |
|---|---|---|
| 1 | `chore: ignore generated build info` | `.gitignore`, untrack `tsconfig.tsbuildinfo` |
| 2 | `chore(supabase): local stack config isolated from other projects` | `supabase/config.toml`, `supabase/.gitignore` |
| 3 | `fix(db): repair migrations 0002/0008/0010 so the chain applies` | the three migration fixes |
| 4 | `feat(pwa): manifest, service worker and install assets` | `client/index.html`, `client/src/main.tsx`, `vite.config.ts`, `package.json` |
| 5 | `fix(security): close Demo Mode fail-open and untrusted role source` | `AuthProvider.tsx`, `ProtectedRoute.tsx`, `roles.ts`, `DemoModeBadge.tsx`, `vite.config.ts` (envDir) |
| 6 | `feat(import): isolate xlsx in a worker and bound the input` | `platform/import/*`, `ImportPage.tsx`, `package.json`, `package-lock.json` (SheetJS 0.20.3 vendor build) |
| 7 | `feat(db): RLS tenant-security hardening` | `0011_rls_tenant_security_hardening.sql` |
| 8 | `feat(db): data correctness (atomic orders, real staff/financial aggregates)` | `0012_data_correctness.sql` |
| 9 | `feat(db): documents storage bucket and policies` | `0013_documents_storage_bucket.sql` |
| 10 | `feat(app): real data replaces seeded and synthetic figures` | dashboard, financials, staff, analytics, suppliers, documents screens + data hooks |
| 11 | `feat(db): staff lifecycle, suspension and audit log` | `0014`, `0015`, `0016` |
| 12 | `feat(app): staff management, invitations, password reset` | `StaffScreen.jsx`, `AcceptInvitePage.tsx`, `PasswordResetPages.tsx`, `staffAdmin.ts`, `App.tsx` |
| 13 | `feat(edge): staff-admin function for privileged provisioning` | `supabase/functions/staff-admin/index.ts` |
| 14 | `feat(db): idempotency receipts and realtime publication` | `0017_offline_idempotency_realtime.sql` |
| 15 | `feat(app): offline-first cache, durable queue and sync engine` | `platform/offline/*`, `queryClient.ts`, mutation hooks |
| 16 | `feat(app): same-pharmacy realtime with reconnect reconciliation` | `platform/realtime/*`, `PlatformPage.tsx` |
| 17 | `feat(app): honest sync states in the UI` | `SyncStatusBadge.tsx`, screen wording (WhatsApp, imports, pending stock) |
| 18 | `test: SQL, API and browser suites (467 checks)` | `supabase/tests/**` |
| 19 | `docs: phase reports, deployment inventory, runbook, backup plan` | `PHASE_*.md`, `docs/**` |

Notes:

* **Nothing is deleted.** Every file currently in the tree is accounted for above.
* `package-lock.json` changes are large because `xlsx` now resolves to the pinned SheetJS vendor
  tarball and several transitive advisories were fixed in range.
* The test suites are intentionally committed: they are the evidence for the security and offline
  behaviour, and they are how a future session re-verifies the system.
* `supabase/tests/seed_e2e.sh` creates **local fixtures only** (`*@e2e.local`) against the local
  stack; it never touches a remote project.
* No secrets are committed. `.env.local` is ignored; the only service-role reference is
  `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` inside the Edge Function.

Suggested final step once you are happy:

```bash
git push -u origin hardening/phases-1-7   # only with your explicit go-ahead
```
