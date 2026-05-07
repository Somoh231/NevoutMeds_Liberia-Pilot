## NevOut Meds — Pilot Readiness Report (Phase 6)

### What shipped in this increment
- **Onboarding**
  - New route: `/onboarding`
  - New DB migration: `supabase/migrations/0006_onboarding_and_pharmacies_rls.sql`
  - New RPC: `public.onboard_new_pharmacy(...)` (creates `pharmacies` row + owner `users_profiles` row for `auth.uid()`)
  - Guard: users can’t enter `/platform` without `user.pharmacyId` (redirects to `/onboarding`)
  - Optional starter data seeding (best-effort) from existing UI seed lists

- **Imports (pilot tooling)**
  - New route: `/import` (owner/admin only)
  - CSV/XLSX upload + parse + preview
  - Validation + skip invalid rows; upsert/insert duplicate strategy
  - New DB migration: `supabase/migrations/0007_unique_constraints_for_import.sql` (supports product upserts)

- **Reliability**
  - Global runtime error boundary: `client/src/platform/reliability/ErrorBoundary.tsx`
  - Lightweight logging hook: `client/src/platform/reliability/logging.ts`

### Blockers (must fix before pilot)
- **Import partial failure reporting**: importer currently skips invalid rows and shows a summary toast, but it does not surface *which rows* failed validation or database insert errors per row.
- **Inventory import product matching**: inventory import matches by **exact product name** (case-insensitive) against existing `products`. If the product doesn’t exist, the row is skipped. Pilot flow needs either “create missing products” or a clear reconciliation UI.
- **Onboarding rollback behavior**: onboarding seeds starter data “best-effort” after creating pharmacy/profile. If seeding fails, onboarding still succeeds (acceptable), but we should show a clear message and offer retry.

### Should-fix soon
- **Chunk size warning**: adding `xlsx` increased bundle size. We should code-split the importer route using dynamic imports.
- **Toast consistency**: platform screens use in-platform toasts; onboarding/import pages should use the same patterns everywhere.
- **Phone normalization at import**: customer phone numbers should be normalized using the existing customer normalization utilities to reduce duplicates.
- **Audit vulnerabilities**: `npm` reports 3 vulnerabilities after adding dependencies. Review and fix (ideally without breaking changes).

### Nice-to-have
- **Import templates**: downloadable CSV templates per module + example files.
- **Dry-run mode**: validate + show what would be inserted/updated without writing.
- **Retry failed rows**: keep “failed” rows in a table with a retry button after fixing data.

### Test plan (manual)
- **Onboarding**
  - Sign up an owner → login → confirm redirect to `/onboarding`
  - Submit onboarding → confirm redirect to `/platform` and data queries now use real pharmacy scope
  - Confirm `/platform` is blocked until onboarding is complete

- **Import**
  - Upload CSV + XLSX for each tab and verify preview
  - Verify required column enforcement
  - Verify “upsert” updates existing records (customers by `phone`, products by `name`)
  - Verify inventory import upserts by product_id once product exists

