# NevOut Meds — Phase 8 foundation redesign report

Date: 2026-09-22 · Branch `phase8/ux-design-system` (baseline tag `pre-phase8-hardened`)
Scope: tokens, primitives, responsive shell, navigation, accessibility and contrast, auth UX, and
the spatial language. **Individual business screens are not yet redesigned** (next block).
Synthetic data only. The backend, database and Edge Function are unchanged. Nothing deployed.

## Gate: **GREEN**

| Suite | Result |
|---|---|
| `npm run build` (tsc + vite) | pass |
| Design-token contrast (`design_tokens.test.mjs`) | **27 / 27** |
| **Foundation gate** (`ui_foundation.e2e.mjs`, new) | **45 / 45** |
| Phase 8 correctness (`ui_phase8_correctness.e2e.mjs`) | **14 / 14** |
| Existing UI suites (workflows 15, offline sale/stock 25, offline-first 21, staff lifecycle 17) | **78 / 78** |
| API: tenant isolation 41, staff lifecycle 47, realtime/offline 24* | **112 / 112** |
| Production smoke against the deployed baseline artifact | **25 / 25** |
| Measured UX audit (`ux_audit.mjs`), 107 page × viewport combinations | see §2 |

\* The realtime suite declares 25 checks; one is a fixture top-up that runs only when stock is low.

UI and API suites ran against the live synthetic backend with a local production build of this
branch; the smoke test ran against the currently deployed baseline, using the updated sign-out step.

### Explicit proofs requested

| Claim | Evidence |
|---|---|
| 360 px no longer pans horizontally | foundation gate: **0 px on 54 workspace screen×viewport pairs and 30 auth page×viewport pairs**; audit: 0 of 54 workspace pages pan (was 27, up to 173 px) |
| Brand/button contrast passes | white on `#0B6B50` measured in the page: **6.50:1** (was 2.54:1); 27 token pairs ≥ AA |
| Keyboard login works | email reached in 2 Tabs, visible 2 px focus ring, Tab → password, **Enter signs in** |
| Password reset remains reachable | "Forgot your password?" on sign-in opens the reset form; validation on Enter; expired-link state verified |
| Invite flow remains functional | real invitation from the Edge Function → accepted **through the UI** → lands in the workspace as staff with no owner navigation (API suite: 47/47) |
| Mobile navigation works | bottom bar 5 × (71×63 px) targets, labels never truncated at 360 px, `aria-current` set, More sheet opens with focus inside, Esc returns focus, every screen reachable at every viewport |
| No tenant/auth behaviour regressed | tenant isolation 41/41, staff lifecycle 47/47, realtime 24/24, staff UI 17/17, offline suites 46/46 |
| No offline state is hidden | offline banner + pill; reopened offline with unsynced work → "Offline · 1" + "saved on this device"; conflict → banner + pill + explanation; slow first load → loading state (all at 360 and laptop) |

## 1. Before vs after

| | Before (deployed baseline) | After (this branch) |
|---|---|---|
| Workspace on a 360 px phone | 533 px layout, 173 px sideways pan, 146 px of usable content | fits exactly; bottom navigation; 0 px pan |
| Navigation | 214 px dark sidebar at every size + 5-button header | phone bottom bar + More sheet · tablet rail · desktop grouped sidebar with pharmacy identity |
| Sign-out | two controls, one below the fold on 1366×768 | one: the account menu, on every device |
| Brand action colour | `#10B981`, white text 2.54:1 | `#0B6B50`, 6.50:1 (luminous green kept for dark surfaces) |
| Headings / landmarks | no h1 on any workspace screen; no landmarks | one h1 per page, `main`, labelled navigation, skip link |
| Focus | 51 `outline: none`, invisible on buttons | visible 2 px ring everywhere (overrides legacy inline styles) |
| Dialogs | `div` overlays, no focus trap, clipped on phones | native `<dialog>`: inert page, Tab wraps, Esc, focus return; bottom sheets on phones |
| Icons | emoji in all chrome | Lucide SVG icons with labels (emoji remain inside legacy screen content) |
| Fonts | Sora from Google Fonts (third-party, fails offline) | system stack: 0 bytes, offline-safe |
| Auth | developer copy, `div` forms, a single error string | designed states for every case; plain-language errors; real forms |
| Offline visibility | a pill in the header | banner on every screen + pill + details panel + conflict explanation |

Before/after screenshots: [`docs/ux/before/`](docs/ux/before/) and [`docs/ux/after/`](docs/ux/after/),
side by side in [`docs/ux/VISUAL_MATRIX.md`](docs/ux/VISUAL_MATRIX.md).

## 2. Measured audit, before → after

`ux_audit.mjs` on the deployed baseline (before) and this branch (after); same 107 page×viewport
combinations. The harness bugs found during this block were fixed before the "after" run (phone
widths are compared against the physical screen; desktop screen size is emulated; text inside
deliberate horizontal scrollers is counted separately as reachable).

| Metric | Auth pages (24) before → after | Workspace screens (54) before → after | Phone subset (36) before → after |
|---|---|---|---|
| Pages that pan sideways | 0 → **0** | **27 → 0** | **33 → 0** |
| Largest pan | 0 → 0 | **173 px → 0** | **173 px → 0** |
| Text cut off | 0 → 0 | **25 → 0** | **42 → 0** |
| Text nodes failing contrast | **12 → 0** | **1 793 → 600** | **1 127 → 327** |
| Targets under 24 px | **18 → 0** | **56 → 6** | 36 → 12 |
| Unlabelled controls | **18 → 0** | 24 → 24 | 15 → 15 |
| Pages without a heading | **24 → 0** | **54 → 0** | 36 → 3 (Import) |
| Text under 12 px | **18 → 0** | 1 224 → 1 368 | 732 → 768 |

The remaining workspace numbers are **inside legacy screen content** (inline 9–11 px labels,
low-contrast inline colours, placeholder-only search boxes, small row buttons). The shell and auth
pages contribute zero. The count of small text rose with the synthetic data, not with the design:
each test run adds invitees, customers and sales, so pages render more rows. Those screens are the
next block. Reachable text inside horizontal scrollers: Inventory table at 360/tablet, Analytics tab
strip at phones.

Cold first visit on slow 3G + 4× CPU: login usable at **4 202 ms** (was 4 231), **165 163 bytes**
(was 173 053), 3 requests, 0 third-party.

## 3. The exact mobile-width fix

The 533 px phantom viewport had two causes: a `flexShrink: 0` 214 px sidebar and a header row of
five fixed-width buttons, and nothing allowed shrinking. The shell (`platform/shell/AppShell.tsx`)
now renders **one** navigation per device class (`useLayout()`: < 768 phone, < 1200 tablet,
otherwise desktop). The phone bar is `position: fixed` inside the viewport. The header is one sync
pill and one avatar menu. Grid columns are `minmax(0, 1fr)`, so no child can widen the page, and
dialogs are bottom sheets bounded by the screen. Three legacy screens had layouts that forced
width: the Dashboard's fixed 2-column grids became `auto-fit, minmax(min(100%, 340px), 1fr)`, the
Analytics tab strip scrolls inside itself, and the Inventory table scrolls inside its card
(`role="region"`, keyboard-focusable). Details in [`docs/ux/UX_DECISIONS.md`](docs/ux/UX_DECISIONS.md) §1.

## 4. Contrast change

Instead of darkening everything, the brand role was split. `--nv-brand` `#0B6B50` is used for
actions and brand text on light surfaces (6.50:1 with white). `--nv-brand-glow` `#4ADE80`, the
logo's luminous green, is kept for the forest surface and decoration (9.86:1 there). The
lightest text colour anywhere is now `--nv-text-muted` `#5A6B64` (≥ 5.0:1 on every light
surface). The legacy `#94A3B8` (2.56:1) was removed from all screen text, and the legacy `GREEN`
constant now resolves to the accessible brand. Offline, pending and conflict got their own tones.
Full table: [`docs/design-system/TOKENS.md`](docs/design-system/TOKENS.md).

## 5. Navigation architecture

Operations (Dashboard · Inventory · Customers · Reminders), Procurement (Suppliers), Insights
(Financials · Analytics, owner), Management (Staff · Documents · Import data, owner); the platform
admin console lives separately in the account menu. Staff see five items; owner features are absent
for them, not greyed out. The rationale, including why there is no "Sales" tab yet, is in
[`docs/ux/UX_DECISIONS.md`](docs/ux/UX_DECISIONS.md) §2.

## 6. New primitives

35 components in `client/src/platform/ui/`, from Button, IconButton and FormField through
Dialog/Drawer on native `<dialog>`, the WAI-ARIA Dropdown and Tabs, MetricCard (a skeleton while
loading, never a 0), ActionCard, and the SyncStatus/OfflineStatus/ConflictState trio. Reference:
[`docs/design-system/COMPONENTS.md`](docs/design-system/COMPONENTS.md). The legacy `Modal`, `Field`,
`Input` and `Toast` keep their APIs but now run on the new primitives, so every existing screen
dialog became an accessible, phone-safe sheet without touching screen logic.

## 7. Spatial design principles

Calm operations, dimensional decisions. Tables and forms stay at depth 0–1. Depth 2–4 (a top inner
highlight plus progressively longer, softer shadows, light from above) is for metric and elevated
cards, menus, dialogs and toasts. Primary buttons lift 1 px (mouse) and sink on press. Selected
tabs and nav items rise out of an inset track. Dialogs settle with a 4° perspective. The auth
"stage" is the single real 3D scene: three opaque planes in perspective, decorative and
`aria-hidden`. ActionCard permits at most 2.5° of tilt, for fine pointers only. There is no tilt
on touch and no motion under `prefers-reduced-motion` (verified). There is no glass: after review,
the stage planes were made opaque because translucency let text show through.

## 8. Accessibility result

* axe-core (WCAG 2.2 AA rule set): **0 critical/serious issues** on sign-in, forgot, reset
  (expired), invite and invite-missing at 360 and 1366, and **0 in the app chrome** at all six
  viewports.
* One `<h1>` and a `main` landmark on every auth page and workspace screen; one labelled main
  navigation per layout; skip link.
* Keyboard: sign-in, account menu (Enter, arrows, Esc), dialogs (Tab wraps, Esc, focus returns),
  phone More sheet, tabs with roving focus.
* Every control in the shell and auth has an accessible name; field errors are announced and tied
  to their input (`aria-describedby`, `aria-invalid`).
* **Not yet clean:** content *inside* legacy screens still has 9–11 px labels, some low-contrast
  inline colours (reduced by ~2/3; see §2), emoji used as icons, and a few placeholder-only search
  boxes. These are listed per screen for the next block.

## 9. Bundle and performance, before → after

| | Before | After |
|---|---|---|
| Main JS (gzip) | 164.05 kB | **152.69 kB** |
| Main CSS (gzip) | 1.97 kB | 8.37 kB (tokens + primitives + shell + auth) |
| Initial JS + CSS | 166.02 kB | **161.06 kB** |
| Cold first visit, slow 3G + 4× CPU: login usable | 4 231 ms | **4 213 ms** |
| Bytes on that first visit | 173 053 | **165 163** |
| Third-party requests | 0 on login, Google Fonts inside the app | **0 anywhere** |

Achieved by lazy-loading the marketing page (with its stylesheet), onboarding, reset, invite and the
four non-dashboard screens. Every chunk is precached by the service worker, so offline start-up and
navigation still work; the four offline suites pass. Idle polling is unchanged (none added).

## 10. Libraries and tools

| Installed | Type | Why |
|---|---|---|
| `lucide-react` 1.47.0 (ISC) | runtime | +3.9 kB for 23 icons, named imports only |
| `axe-core` 4.13.0 (MPL-2.0) | dev | accessibility gate inside the CDP harness |
| `pixelmatch` 7.2.0 + `pngjs` 7.0.0 (ISC/MIT) | dev | `visual_diff.mjs` for screenshot regressions between builds |

Rejected after measurement: Radix (+29.2 kB), Motion (+42.5 kB), Floating UI (+13.9 kB), React
Aria (+15.6 kB), Tailwind/shadcn. See [`DESIGN_TOOLING_AND_SKILLS.md`](DESIGN_TOOLING_AND_SKILLS.md) §5.

## 11. Defects found and fixed along the way

1. **Invitation acceptance hung in the UI** ("Confirming your invitation…" forever, although the
   server had accepted it). The effect cancelled its own request because it depended on its own
   `busy` flag. This predates the redesign and was invisible to the API suite; it is now covered
   end to end.
2. Onboarding would have pre-filled the placeholder "Your pharmacy" after the P0-8 fix; it now uses
   the name the owner typed at sign-up.
3. The restricted-screen message named an invented person ("Contact John Kamara").
4. A misconfigured build showed "Supabase is not configured" to end users.
5. The login redirect accepted any `state.from`; it now accepts only same-app paths (defence
   against the pre-existing react-router backslash advisory, whose upgrade is tracked separately).
6. The seed scripts wrote the **service-role key** to `/tmp/nevout_service.jwt` world-readable
   (mode 644); they now write it owner-only (600).
7. Audit harness: phone overflow was invisible (the layout viewport stretches), and desktop
   "clipping" was over-counted (screen size not emulated). Both measurement bugs are fixed and
   documented.

## 12. Remaining work, by screen (next block)

| Screen | What the foundation does not fix yet |
|---|---|
| Dashboard / Morning briefing | emoji KPI icons, 10 px uppercase labels, KPI tiles not yet `MetricCard`, empty chart states |
| Inventory | table → card list on phones (it scrolls today), filter chips → `FilterBar`, search label, 36 px row action |
| Sales | **no Sales screen yet**: counter sales still go through Customers (audit P1-4) |
| Customers | 11 px "+ Sale" button, placeholder-only search, card density |
| Reminders | low-contrast status text, tiny labels |
| Suppliers / price compare / purchase orders | emoji tabs, tables on phones |
| Financials / cash flow · Analytics / reports / AI analyst | inline dark scorecard styles, 10 px labels, tables at 360 px |
| Staff, Documents, Import, Admin console | tables on phones, placeholder-only inputs, legacy buttons |
| Cross-cutting | locale and currency layer (USD/LRD and six other countries), timezone-correct day buckets (server), slow offline cold start (~5–8 s before the shell appears) |

Still open outside UI (unchanged): SMTP, Supabase plan/backups and a restore rehearsal, named
incident and backup owners, and the two Edge Function origin secrets
(see `REMOTE_PRODUCTION_BASELINE_REPORT.md` §13).

---

# Core product experience (second Phase 8 block) — **GREEN**

Twelve operational screens redesigned on the foundation, in five gates, each tested before the
next began. Synthetic data only. The backend and its transaction and idempotency semantics are
unchanged. Nothing deployed.

## Final regression

| Suite | Result |
|---|---|
| Build (tsc + vite) | pass |
| **Core task flows, Gates A–E** (`ui_core_flows.e2e.mjs`, new) | **80 / 80**, plus A5b (nav badge) after the fix: 21 / 21 for Gate A |
| Phase 8 foundation | 45 / 45 |
| Phase 8 correctness | 14 / 14 |
| UI workflows · offline sale/stock · offline-first · staff lifecycle | 15 · 25 · 21 · 17 |
| API: tenant isolation · staff lifecycle · realtime/offline | 41 · 47 · 24 |
| Production smoke (deployed baseline) | 25 / 25 |
| Responsive audit (107 page × viewport) | **0 pages pan, 0 cut-off text** |

## Task flows proven (360 px unless noted; the server is ground truth)

| Task | Proof |
|---|---|
| Find a product | search → 1 row showing stock, days left and expiry |
| Adjust stock | detail sheet → Adjust → +1 → server +1, exactly once |
| Reorder | Reorder → suggested qty with the price source stated → purchase order on the server → explicit "Open WhatsApp to send" |
| Record a sale | Sales: customer + product via search and Enter, qty 2 → "Sale recorded · Synced", +1 purchase, −2 stock |
| Sale offline | "Saved on this device · Pending sync" in the pending tone, queued, then synced exactly once |
| Add a customer | name + phone + Enter → persisted; gender and county empty (no invented defaults) |
| Refill reminders | overdue reminder surfaced with days late → Open WhatsApp → Mark as reminded → `sent=true` on the server |
| Compare suppliers → order | best total wins (a MOQ-inflated cheaper unit price loses), out of stock can’t be ordered, stale price flagged, "Not recorded" for delivery and reliability, order created for the chosen supplier; offline order pending → synced once |
| Respond to expiry risk | briefing → Expiry → write-off pre-filled with the full expired quantity → stock 0 on the server, item leaves the list |
| Act on a finding | Analyst priority finding → one tap to where it’s resolved |
| View cash exposure | Financials 30d equals the server summary; paid now + on credit = revenue; 7-day period recalculates |
| Reports | sales equals the server with the previous-period comparison; keyboard tabs; CSV export; accessible day table |

## Measured audit, foundation → core block

| Workspace screens (54) | Before Phase 8 | After foundation | After core block |
|---|---|---|---|
| Pages that pan | 27 | 0 | **0** |
| Text cut off | 25 | 0 | **0** |
| Text failing contrast | 1 793 | 600 | **186** |
| Targets under 24 px | 56 | 6 | **0** |
| Text under 12 px | 1 224 | 1 368 | **579** |
| Pages without a heading | 54 | 0 | 0 |

The remaining contrast and small-text counts are in Staff, Documents, Import and the admin console,
which weren’t in this block. axe finds **0 critical/serious** issues in the content of every
redesigned screen at 360 px and 1366 px.

## Bundle

| | Foundation end | Core block end |
|---|---|---|
| Main JS (gzip) | 152.69 kB | **154.96 kB** (the briefing is eager) |
| Main CSS (gzip) | 8.37 kB | 10.54 kB |
| Initial JS + CSS | 161.06 kB | 165.50 kB (budget ~165 kB + CSS — see below) |
| New lazy chunks | — | Sales 0.9 · Reminders 3.3 · Customers 4.7 · Expiry 2.4 · Financials 2.5 · Reports 4.3 · Analyst 5.1 · Suppliers 8.5 kB |
| Cold login, slow 3G + 4× CPU | 4 202 ms / 165 163 B | **4 201 ms / 169 617 B**, 3 requests, 0 third-party |

Main JS stays under the ~165 kB JS budget, and no chart or animation library was added. CSS grew
by 2.2 kB for the new operational patterns.

## Defects found and fixed in this block (beyond the redesign)

1. **Fake success:** Reorder toasted "Reorder sent to *supplier* ✓" using invented suppliers and sent
   nothing. Suppliers also showed an invented fallback directory, and a WhatsApp button that only
   toasted "WhatsApp opened".
2. **Invented supplier data:** a default 4.6★ rating, 120 reviews, 96 % on-time and "Net 7 (demo)".
3. **Invented expiry:** products without a date were given 2099-12-31.
4. **Reminders vanished:** they were wiped whenever customers refreshed after reminders loaded, so
   the dashboard always showed 0 due.
5. **Invented patient defaults:** "Female" and "Montserrado" were pre-selected and saved.
6. **Offline sale looked hung:** success waited on background refetch retries.
7. **Status rule:** "expiring" hid "critically low" (caught by the Gate A flow test on its first run).
8. **Wrong "days of cover":** it divided stock at cost by revenue at selling price.
9. **Mismatched badge:** the navigation badge didn’t count out-of-stock items.

## Remaining screen-specific gaps

* **Staff, Documents, Import, Admin console:** still legacy screens (the 186 remaining contrast
  failures and 6 unlabelled inputs are there).
* **Purchase orders:** receiving (and partial receipts) needs a server workflow that also moves
  stock. Until then, the order view says so.
* **Suppliers:** price history isn’t stored (only the latest price), and there are no
  delivery-cost fields. Reliability can’t be measured until receiving exists.
* **Customers:** credit repayments can’t be recorded; sales require a registered customer (by
  server design).
* **Sales:** the dashboard’s recent-sales list is the latest 8 only.
* **Locale:** currency, timezone, phone and address are Liberia/USD-shaped; this is the next phase.

Screenshots: [`docs/ux/after-core/`](docs/ux/after-core/).
