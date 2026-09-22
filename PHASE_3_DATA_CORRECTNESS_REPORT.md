# NevOut Meds — Phase 3 Report: Data correctness

Date: 2026-09-22
Backend: Supabase project `qohpyeqyveusnxhnbtxz` — **nothing deployed to the remote project.** All work is local.

## Gate status: **PASS**

| Gate | Result |
|---|---|
| Migrations `0001` → `0013` on a **fresh** database | 13/13 apply, no manual steps |
| Phase 2 security suite (regression) | **83/83** pass, slowest check 3 ms |
| Phase 3 data-correctness suite | **125/125** total pass (83 security + 42 new) |
| API tests through PostgREST + Storage with real JWTs | **41/41** pass |
| UI tests driving the real app against local Supabase | **15/15** pass |
| `npm run build` | passes |

---

## 1. Findings, classified

| # | Original finding | Status | Evidence |
|---|---|---|---|
| 1 | Customer creation does not persist | **FIXED** | Creation was React-state only. Now `createCustomer()` inserts first and the row appears only after the database accepts it. Proven in the real UI: a customer typed into the form is in Supabase and survives a full reload (`ui_workflows.e2e.mjs`), plus SQL and HTTP checks. |
| 2 | Product creation unsafe | **FIXED** | Goes through the `create_product` RPC (added in 0011): tenant-checked, value-validated, and atomic. Negative stock, blank name and foreign pharmacy are all rejected. |
| 3 | Seeded Staff data | **FIXED** | `STAFF_DATA` is gone from the screen. `staff_performance()` returns the pharmacy's real `users_profiles` rows with sales attributed from real `purchases`. Owner-only; pharmacy B sees only its own staff and none of A's sales. |
| 4 | Synthetic financial / debt / cash-flow / margin / staff-performance metrics | **FIXED** | Removed everywhere they were invented: the `$240` "Today's Revenue", `↑12%`, `↑22% YoY`, the `$3,240` cash-on-hand, `55.6%` margin, the fabricated "Debt Warning" tile and the synthetic cash-flow projection panel. Financials now derive revenue, COGS, gross margin, credit and stock value from records, and **declare** the four figures the database cannot produce (`operating_expenses`, `cash_on_hand`, `supplier_debt`, `payroll`) in a "Not tracked yet" panel. The AI Analyst was rewritten: no invented suppliers, prices, debts, interest rates or customer names — each insight is computed from the pharmacy's own data, and insights whose data is missing are simply not emitted. |
| 5 | Hard-coded dashboard dates | **FIXED** | `"Wednesday, 22 April 2026"` and the hard-coded WhatsApp report date are replaced with the real date. Verified in-browser: the dashboard renders today's date. |
| 6 | Purchase-order creation not atomic | **FIXED** | `create_purchase_order` writes order + lines in one transaction and **computes the total server-side** instead of trusting the client. A rejected line leaves no order row (verified by count before/after). |
| 7 | Product creation not atomic | **FIXED** | `create_product` writes product + inventory + opening stock movement in one transaction. A rejected create leaves nothing behind. |
| 8 | Document upload / metadata partial failure | **FIXED** | `createDocumentWithFile()` removes the uploaded object if the metadata insert fails, and reports the original error (or a clear message naming the file if cleanup also fails). The compensating sequence is verified end-to-end over HTTP: upload → failed metadata → cleanup → **no orphaned file and no orphaned row**. This also uncovered a bigger gap: **the `documents` storage bucket never existed**, so uploads would have failed outright in production. Migration `0013` creates it (private, size- and mime-limited) with tenant-scoped storage policies: objects must live under a `<pharmacy_id>/` prefix, only owners/admins may write, and another pharmacy cannot list or read them. |
| 9 | `app_feedback` FK / nullability inconsistency | **FIXED** | Codex's fix was verified and is now **asserted in the migration and tested**: `app_feedback.user_id` is nullable with `ON DELETE SET NULL`, while `app_events.user_id` is NOT NULL with `ON DELETE CASCADE`. Behavioural test: removing a staff member keeps their feedback (user_id nulled) and removes their events, with no FK violation. |
| 10 | Optimistic UI shows success after failed persistence | **FIXED** | Stock adjustment and product creation used to update the list and toast "success" **before** the write. Both now persist first and only then touch the UI; on failure the UI is unchanged and the toast is a real error. Customer creation and purchases likewise. Failure toasts that were styled as "info" are now errors in reminders, inventory and documents. |

## 2. What changed

**Database (`0012`, `0013`)**
* `create_purchase_order` — atomic, tenant-checked, server-priced.
* `staff_performance(days)` — real per-staff sales, owner/admin only, own pharmacy only.
* `financial_summary(days)` — real revenue (total/today/by method/daily), COGS from line items and product cost, credit outstanding and over-limit customers, inventory value at cost and retail, plus an explicit `not_tracked` list.
* Telemetry FK/nullability consistency asserted rather than assumed.
* `documents` storage bucket + tenant-scoped Storage policies (no-op on a database without Supabase Storage, so the test harness stays portable).

**Client**
* New: `useCreateCustomer`, `useStaffPerformance`, `useFinancialSummary`, `createDocumentWithFile`.
* Seed fixtures no longer leak into a real workspace: inventory, customers, documents and suppliers start empty and fill from Supabase. The seeded supplier marketplace is still shown when a pharmacy has no suppliers of its own, but is now **labelled as sample data**.
* `financial_summary` is only called for owner/admin (staff correctly get 403), and "Today's Revenue" is sourced from purchases that staff can read, so staff see a real number.

## 3. Tests added (all executable)

* `supabase/tests/20_data_correctness.test.sql` — 42 checks: customer persistence and tenant isolation, atomic product creation (inventory + opening movement, and nothing left behind on failure), atomic purchase orders with server-side totals, staff performance attribution and owner-only access, financial summary correctness and its `not_tracked` declaration, telemetry FK behaviour on staff removal, and **same-pharmacy multi-user**: a sale recorded by staff is immediately visible to the owner, with shared stock (40 → 39) and matching financials.
* `supabase/tests/api_tenant_isolation.e2e.mjs` — grown to 41 checks, now covering customer persistence over HTTP, duplicate-phone rejection, atomic product/purchase-order creation, owner-only analytics, document storage isolation and the document compensation sequence.
* `supabase/tests/ui_workflows.e2e.mjs` — 15 checks driving the built app with real mouse/keyboard events: customer creation persists and survives reload, the dashboard shows today's real date and no invented figures, the staff screen lists real database staff, and financials declare untracked figures instead of inventing them.

**Tenant isolation was re-verified after every change**: the Phase 2 suite runs first in the same database and still passes 83/83.

### A real bug the new tests caught
The owner dashboard crashed into the error boundary (`cashShortfall is not defined`) after the synthetic cash-flow panel was removed — a `.jsx` file, so `tsc` never saw it. The UI test caught it, and the error came back from the app's own `app_logs` telemetry. It is fixed and the panel now reports where working capital actually sits (credit owed + stock at cost).

## 4. Dependency status (after the approved SheetJS replacement)

`xlsx` now comes from the vendor release pinned in `package.json`:
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (SHA-256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`),
with the URL and a sha512 integrity hash in `package-lock.json`. A clean `npm ci` reproduces 0.20.3 exactly.

Both xlsx advisories (prototype pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9) are gone. **All import protections were preserved and re-verified**: Web Worker isolation (xlsx still ships only in the worker chunk), 15 s parse timeout, 5 MB file limit, 5,000-row cap, a new 64-column cap, 64-char keys / 500-char values, `__proto__`/`constructor`/`prototype` stripped, and legacy `.xls` still rejected (safer policy kept). Re-tested in headless Chromium: hostile `__proto__` + `constructor` workbook → 2 rows previewed and `({}).polluted` stays `null`; CSV with a `__proto__` column → column dropped; 6,000-row workbook → capped at 5,000; 6 MB file → rejected; `.xls` → rejected.

Remaining runtime findings: **2 moderate**, both `react-router`/`react-router-dom` 6.30.6 (open redirect via `//` or `\` in `navigate`/`<Link>`; fix requires the v7 major). Mitigated by usage — the post-login redirect comes from in-app router state, not a URL parameter. Do not add `?redirect=` URL handling before upgrading. Dev-only: `vite`/`esbuild` (1 high, 1 moderate), not part of the production bundle.

## 5. Docker

Per your approval I stopped the **analytics and vector containers across the local projects** (they were the CPU hogs — NevOut's own Logflare was at 162%). Every project's database and API were left running, no data or configuration was deleted, and the NevOut test stack is fully available. Result: `docker exec` round-trip went from **73 s to 0.21 s**, load average 285 → ~150 and falling. I also restarted NevOut's own auth container so GoTrue re-ran its migrations after the database reset.

## 6. Open items

| Item | Status | Note |
|---|---|---|
| GoTrue password sign-in through local Kong | **NOT VERIFIED** | Returns 502 after ~18 s (upstream timeout in the local auth container). Local infrastructure only — not an app defect. UI tests therefore inject a signed session; PostgREST applies the same RLS either way. Worth re-checking before pilot, since real users will sign in through this path. |
| Supplier marketplace prices | **MITIGATED** | Still sample data when a pharmacy has no suppliers, now explicitly labelled. Real price-compare depends on pharmacies entering their own supplier catalogue (product-value phase). |
| Reminder "sent via WhatsApp" wording | **OPEN** | The app marks reminders sent and opens WhatsApp manually; no delivery is confirmed. Not in the Phase 3 list, but the copy overstates what happened. |
| Import partial-failure reporting for products/customers | **MITIGATED** | Inventory import now reports per-row errors from the server. Product and customer imports still report only a skipped count. |
| Staff lifecycle (invite → accept → provisioning) | Phase 4 | Not started. |
| Realtime multi-user sync | Phase 5 | Same-pharmacy visibility is proven on refetch, not yet live. |
| Offline-first queue | Phase 6 | Not started. |

Nothing has been committed — all changes remain in the working tree.
