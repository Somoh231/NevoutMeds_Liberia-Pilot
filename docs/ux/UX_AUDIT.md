# NevOut Meds — Phase 8 Part B: UX audit (before any redesign)

Date: 2026-09-22 · Branch: `phase8/ux-design-system` (from tag `pre-phase8-hardened`)
Target: the deployed production artifact `https://nevout-meds-liberia-pilot.vercel.app`, synthetic
accounts only (`ownerA@e2e.local`, `staffA@e2e.local`). No real pharmacy or patient data.

## How this was measured

`supabase/tests/ux_audit.mjs` drives real Chromium over CDP through **every public route, every
workspace screen, the primary dialogs, and both roles** at six viewports, then **measures** the
page instead of relying on opinion:

| Viewport | Size | Emulation |
|---|---|---|
| 360 | 360×780 | mobile, touch, DPR 2 (typical low-end Android) |
| 390 | 390×844 | mobile, touch, DPR 3 |
| 430 | 430×932 | mobile, touch, DPR 3 |
| tablet | 768×1024 | mobile, touch, DPR 2 |
| laptop | 1366×768 | desktop |
| desktop | 1920×1080 | desktop |

Measured per page × viewport (**107 combinations**): horizontal pan (layout viewport wider than the
device), text clipped past the right edge, width left after the sidebar, touch-target sizes
(WCAG 2.2 AA 2.5.8 minimum 24 px; 44 px mobile target), text under 12 px, WCAG contrast per text node
(composited backgrounds), controls without an accessible name, heading structure, and a cold first
visit on slow 3G (400 kbit/s, 400 ms RTT) with 4× CPU throttling.

Raw data: [`before/ux_audit.json`](before/ux_audit.json). Screenshots (360 and 1366, WebP):
[`before/`](before/). To re-run the audit:
`APP_URL=… CHROME=… UDD=… OUT=… node supabase/tests/ux_audit.mjs`.

> **Why the first pass showed no overflow at all:** on a phone, a page wider than the screen
> silently widens the *layout* viewport, so `scrollWidth === innerWidth` and nothing
> "overflows". The page still has to be panned sideways. The harness now compares the layout
> viewport with the device width (`panPx`). Any future mobile check must do the same.

---

## Headline

The public and auth pages hold up at every width. **The workspace, where pharmacists actually
work, is not usable on a phone.** On top of that, the audit found **three places where the app
shows numbers or text that are wrong or made up**. Those are correctness defects, not styling
issues, and they come first.

| Severity | Count | Meaning |
|---|---|---|
| **P0** | 8 | Wrong information shown, or the primary device cannot do the job |
| **P1** | 14 | Materially slows or excludes users; accessibility failures |
| **P2** | 7 | Polish, consistency |

---

## P0 — must fix

### P0-1 · Workspace does not fit any phone
Every workspace screen and dialog (Dashboard, Inventory, Customers, Suppliers, Reminders, Staff,
Financials, Analytics, Documents) forces a **533 px layout** on phones:

| Device width | Sideways pan | Width left for content next to the 214 px sidebar |
|---|---|---|
| 360 | **173 px** | 146 px visible without panning |
| 390 | **143 px** | 176 px |
| 430 | **103 px** | 216 px |
| 768 (tablet) | 0 | 554 px (sidebar uses 28% of the screen) |

Causes: a fixed 214 px sidebar with no mobile mode, plus a header row of five fixed-width buttons
(Synced · Help · Import · Public Homepage · Logout). At 360 px, "NevOut Meds Platform" wraps over
the sync badge, card labels are cut off ("TODAY'S REVENUE" is clipped), the inventory table shows
one and a half columns, and the Add Product dialog is clipped on the right.
Screenshots: `before/360__owner-dashboard.webp`, `before/360__owner-inventory.webp`,
`before/360__dialog-inventory--add-product.webp`.

### P0-2 · Fabricated metric on Analytics
`AnalyticsScreen.jsx:127` hard-codes **"Net Margin 55.6% — Above regional avg"**. The number is a
constant, and no regional dataset exists. This breaks the rule set in Phase 3 that nothing shown to
the pharmacist is invented.

### P0-3 · Two different "30-day revenue" figures for the same pharmacy
For the same account at the same moment: Dashboard **$136** (server KPI `revenueLast30Days`)
vs Analytics **$122**. Analytics sums only purchases attached to customer records
(`customers.flatMap(c => c.purchases)`) and buckets them by **UTC** date (`toISOString`), which is
also wrong for any pharmacy east of UTC (Kenya +3, Rwanda +2, Nigeria +1).

### P0-4 · Reorder message names the wrong pharmacy
`InventoryScreen.jsx:347` passes `locationLabel: "Monrovia Central"` into the WhatsApp message
sent to suppliers, **for every pharmacy**. A supplier would receive an order that names someone
else's pharmacy.

### P0-5 · The brand's primary colour fails contrast
White on `#10b981` is **2.54:1** (AA needs 4.5:1). This covers every primary button: Sign in and
join, Send reset link, + Add Product, + Register Patient, + Sale, Open in WhatsApp. The same green
used for text on white (KPI values such as "$135.50") is also **2.54:1**. It is a token problem,
so one fix covers every screen.

### P0-6 · No route to password reset from the login page
`/forgot-password` exists and works, but `LoginPage.tsx` never links to it. A pharmacist who forgets
their password has no way to find the reset page.

### P0-7 · No `<form>` anywhere in the app
Pressing **Enter does not submit** login, sign-up, reset, invite, or any dialog (the harness
confirmed this on login: `enterSubmitsLogin: false`). The app also loses native required-field
validation and gives password managers less to work with. Only the marketing page has a form.

### P0-8 · Liberia hard-coded into data the user can save
* Owner sign-up **pre-fills the pharmacy name** "Monrovia Central Pharmacy" (`LoginPage.tsx:26`).
  A user who does not notice creates a workspace with someone else's name.
* Onboarding pre-fills country "Liberia" and city "Monrovia".
* `roles.ts:15` falls back to "Monrovia Central Pharmacy" when metadata is missing.

For a multi-country product these are data defects, not copy.

---

## P1 — significant

| # | Finding | Evidence |
|---|---|---|
| P1-1 | **No loading states on 8 of 10 screens.** A configured workspace starts with `medicines = []`, so on a slow first load the dashboard shows **"All stock levels healthy" and "0 critical"** before any data arrives. That is false reassurance. | `NevoutmedsApp.jsx` initial state; grep: 0 loading/skeleton references in Dashboard, Inventory, Customers, Suppliers, Reminders, Financials, Analytics, Documents |
| P1-2 | **Sign-out and identity are below the fold on a 1366×768 laptop.** The sidebar is `100vh` sticky *under* a 55 px header, so its footer falls 55 px off-screen. | `before/laptop__owner-inventory.webp` |
| P1-3 | **Duplicated chrome.** Two brand blocks, the name spelled three ways ("NevOut Meds Platform", "Nevoutmeds", "NevOut Meds"), and two sign-out controls (header "Logout" plus an unlabeled sidebar "⏻" at 20×23 px). | all workspace shots |
| P1-4 | **Recording a sale is buried.** The most frequent counter task is only reachable via Customers → find the customer's card → "+ Sale" (a 26×11 px-text button). There is no walk-in sale and no quick action on the dashboard. | `CustomersScreen.jsx:195` is the only entry point |
| P1-5 | **No document structure.** 0 headings (`h1`–`h6`) on every workspace screen, 0 `aria-*` attributes across the app shell and all feature screens, and no landmarks for the main content. | harness `headings: []`; grep |
| P1-6 | **Emoji used as icons.** 14 on the dashboard alone. Screen readers announce them ("money bag", "package"), and older Android emoji fonts render newer ones as blank boxes. | harness `emojiIcons` |
| P1-7 | **Unlabeled inputs.** Search fields on Inventory, Customers and Documents, the sort select, the accept-invite and forgot-password fields, and the import file input rely on placeholder text only. | harness `unlabeled` |
| P1-8 | **Focus not visible.** 51 `outline: none` declarations; buttons have no focus style at all. Keyboard users cannot see where they are. | grep |
| P1-9 | **Low contrast is systemic: 388 failing text nodes at 1366 px.** Sidebar items 4.24:1, section labels ("Operations", "Owner Only") 1.95:1, table headers 2.45:1, KPI labels 2.56:1. | harness `contrast` |
| P1-10 | **Tiny text: 260 nodes under 12 px** (9–11 px labels). On phones the forced zoom-out (×0.675) makes 11 px render at about 7.4 px. | harness `tinyText` |
| P1-11 | **Touch targets.** At 360 px, **358 of 428** controls are under 44 px. Several are under the 24 px AA minimum: "View all →" 62×15, "Back to sign in" 96×16, "Forgot your password?" ×15, the import file input at 21 px, and the ⏻ button. | harness |
| P1-12 | **Money is hard-coded to US dollars.** `fmt()` prefixes "$" everywhere, and purchase orders send `p_currency: "USD"`, although the schema already stores a per-pharmacy `currency`. Liberia prices in both USD and LRD; the other six target countries do not use USD. | `platform/utils/format.ts`, `purchaseOrders.ts:26` |
| P1-13 | **Dates are ambiguous or US-format.** Expiry shows "Dec 99" (2099 or 1999?). The date input shows `mm/dd/yyyy`, while every target country writes dd/mm/yyyy. Phone placeholders are hard-coded to +231. | `InventoryScreen.jsx:273`, `CustomersScreen.jsx:304` |
| P1-14 | **Runtime Google Fonts `@import`** of Sora in 6 weights, injected by the app shell. It adds a third-party round-trip on 3G, is unavailable offline (text renders in a fallback font), and discloses usage to a third party. | `NevoutmedsApp.jsx:136` |

## P2 — polish

| # | Finding |
|---|---|
| P2-1 | Developer copy shown to users: "(next step: RLS + admin tooling)", "Ready for RLS" on login; "Syncs to Supabase when configured" in Add Product. |
| P2-2 | "← Public Homepage" link in the workspace header: a marketing link in a staff tool. |
| P2-3 | Header content is centred in a max-width container while the sidebar is full-bleed, so the two misalign at every desktop width. |
| P2-4 | Products whose reorder point is not set show a full purple "Overstock" bar; "Set a reorder level" would be accurate. |
| P2-5 | An owner opening `/admin` is silently redirected to `/platform` with no explanation. |
| P2-6 | On the Staff screen one avatar's initials measure **1.00:1** (text the same colour as its background). |
| P2-7 | Homepage nav links are 16 px tall (below the 24 px minimum); homepage KPI mock-up values are 2.5–3.4:1. |

## What already works (keep it)

* Public, login, forgot, reset and accept-invite pages: **no panning at any width**, and no
  clipped text.
* **Cold first visit on slow 3G with 4× CPU: login usable at 4.2 s, 173 kB transferred, 3 requests,
  0 third-party hosts.** This is the budget to protect.
* Sync badge ("Synced") is visible and truthful. Offline queue states were verified in Phases 5–7.
* Empty states on Dashboard ("All stock levels healthy", "No reminders due this week") are well
  worded **once data has loaded** (see P1-1).
* Financials declares what is not tracked instead of inventing it (Phase 3). Analytics must be
  brought up to the same standard (P0-2, P0-3).
* Console: one 403 resource error only, from a permission-gated request; no script errors.

---

## Task paths today (steps a pharmacist must take)

Steps are counted from the current UI on a laptop; on a phone, each also needs sideways panning.

| Task | Current path | Problem |
|---|---|---|
| Record a walk-in sale | Customers → search for the customer → "+ Sale" on their card → form | Needs a customer record first; a walk-in cannot be sold to directly |
| Check what is running out | Dashboard → Stock Alerts card, or Inventory → Critical/Low chip | Fine on desktop; unreachable on a phone without panning |
| Adjust stock after a count | Inventory → find row → ✎ (icon-only, 24 px) | Icon without a label; tiny target |
| Send refill reminders | Reminders → row action | Fine |
| Reorder from a supplier | Inventory → row → reorder → WhatsApp | Message names the wrong pharmacy (P0-4) |
| Invite staff | Staff → Invite → form | Fine; form does not submit on Enter |
| Sign out | Header "Logout" or sidebar ⏻ | Two controls; one below the fold on a laptop |

---

## Implementation order (Part C), gated by this harness

1. **Correctness first** (P0-2, P0-3, P0-4, P0-8, P1-1): remove the fabricated margin; give
   Analytics the same server revenue source as the Dashboard; take the reorder location from the
   pharmacy; remove saved defaults; add real loading states so empty never means "not loaded yet".
2. **Tokens** in `client/src/platform/design/tokens/`: an AA-safe palette (primary action about
   `#047857`, 5.5:1 with white), a type scale with a 12 px floor and 14–16 px body text, spacing,
   radius, elevation, and a focus ring. Self-host the font or use the system stack (P1-14).
3. **App shell**: phones get a bottom tab bar (Home · Stock · **Sell** · Customers · More), tablets
   a collapsible rail, and screens ≥1024 px a sidebar. One header, one account menu, one sign-out,
   and no marketing link (P0-1, P1-2, P1-3, P2-2, P2-3).
4. **Primitives** in `client/src/platform/ui/`: Button/IconButton (required accessible name,
   44 px on touch), Field (label, hint, error), Form (Enter submits), Dialog (full-screen sheet on
   phones, focus trap), responsive DataList (table on desktop, cards on phones), PageHeader (`h1`),
   EmptyState, Skeleton, StatusPill with a text label (P0-7, P1-5 to P1-11).
5. **Auth UX**: forgot-password link, real forms, no developer copy, no pre-filled names (P0-6,
   P0-7, P2-1).
6. **Locale layer**: a pharmacy's country drives currency, dual-currency display where it applies
   (Liberia USD/LRD), timezone-correct day boundaries, `Intl` date and number formats, and phone
   prefix. Country matrix: Liberia, Sierra Leone, Ghana, Nigeria, The Gambia, Kenya, Rwanda
   (P1-12, P1-13).
7. **Quick sale** entry point on the dashboard and in the tab bar (P1-4).

**Exit criteria**, re-measured by `ux_audit.mjs` on the redesigned build:
`panPx = 0` on every page at 360/390/430; 0 clipped text; 0 targets under 24 px, and primary
controls ≥44 px on touch; 0 contrast failures on redesigned screens; every input labelled; one `h1`
per screen; login still usable within 4.5 s on slow 3G; main bundle ≤ ~165 kB gzip; zero idle
polling. The full functional suite (467 local and 216 remote checks) must still pass.
