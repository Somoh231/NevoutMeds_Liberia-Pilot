# Components

Import everything from `@/platform/ui`; icons only from `@/platform/ui/icons`. The primitives are
presentation only. No data fetching and no business rules live in them.

## Controls (`controls.tsx`)

| Component | Notes |
|---|---|
| `Button` | `variant`: primary · secondary · ghost · danger · on-strong; `size`: sm · md · lg; `block`; `loading` shows a spinner, sets `aria-busy`, blocks repeat submits; `icon`. Defaults to `type="button"`. |
| `IconButton` | **`label` is required**: it becomes `aria-label` and a title. 44 px on touch. |
| `FormField` | Label + control + hint + error. Wires `id`, `aria-describedby`, `aria-invalid` and `required` into the control automatically (context), and announces errors (`role="alert"`). |
| `Input`, `Select`, `Textarea` | Pick up the field wiring; 16 px text on touch; the 3.4:1 border meets WCAG 1.4.11. |
| `SearchInput` | Requires `label` (placeholder-only search boxes were an audit defect). |
| `PasswordInput` | Show/hide toggle is a labelled button with `aria-pressed`. |
| `Checkbox` | Native input, 20 px, with a 44 px row target. |
| `Switch` | `role="switch"`, `aria-checked`, labelled and described. |

## Surfaces (`surfaces.tsx`)

| Component | Depth | Notes |
|---|---|---|
| `Card` | 1 | calm operational panel; `flush` for edge-to-edge tables |
| `ElevatedCard` | 2 | a step above neighbours |
| `MetricCard` | 2 (or strong) | label, tabular value, sub; `pending` shows a skeleton, **never a 0**; `onClick` makes it a button |
| `ActionCard` | 2 → 3 | decision surface; the only component with pointer tilt (≤2.5°, fine pointer only, off with reduced motion) |
| `PageHeader` | — | screen title block; `<h2>` by default because the shell's top bar holds the page's single `<h1>` (`level={1}` outside the shell), description, actions |
| `SectionHeader` | — | `<h2>`/`<h3>` + description + actions |
| `FilterBar` + `Chip` | — | search + chips (`aria-pressed`) + actions; chips scroll inside themselves on phones, the page never does |

## Feedback (`feedback.tsx`)

| Component | Notes |
|---|---|
| `Badge` | `tone`: neutral · brand · success · warning · danger · info · offline · pending · conflict |
| `StatusBadge` | badge + dot (`live` pulses); **text always carries the meaning**, colour only reinforces it |
| `Alert` | tone, icon, title, body, actions; `role="alert"` for danger/warning/conflict, `status` otherwise |
| `Toast` | a live region that always exists; errors are assertive. Sits above the phone bottom bar. |
| `Skeleton`, `SkeletonBlock` | loading shape; `SkeletonBlock` has a labelled `role="status"` |
| `EmptyState` | icon, `<h3>` title, body, actions, optional tone |
| `ErrorState` | says what failed and offers one retry |

## Overlays (`overlays.tsx`)

| Component | Notes |
|---|---|
| `Dialog` | Native `<dialog>` + `showModal()`: inert page, Esc, top layer. We add Tab wrapping (`trapTab`), backdrop close and focus return. Bottom sheet on phones, centred with a 4° perspective settle from 768 px. Labelled by its title (`hideTitle` keeps it for screen readers only). |
| `Drawer` | same mechanics; `side`: bottom (phones, the More sheet) · right · left |
| `Dropdown` + `MenuItem` | WAI-ARIA menu button: Enter/Space/↓ open and focus the first item; ↑/↓/Home/End move; Esc closes and returns focus; Tab and outside click close |
| `Tooltip` | on hover *and* keyboard focus, via `aria-describedby`; never the only place information lives |
| `Tabs` + `tabPanelProps` | roving tabindex, arrow keys, Home/End; `block` tabs wrap instead of widening the page |

## Sync status (`status.tsx`)

| Component | Notes |
|---|---|
| `SyncStatus` | top-bar pill: Synced · Syncing… · Waiting to sync · Sync failed · Needs attention · Offline, plus a waiting count; opens a details panel listing every queued item and a "Try syncing now" action. Compact on phones (icon + count; the label stays for screen readers). The labels are unchanged from Phase 6. |
| `OfflineStatus` | a banner under the top bar on every screen while offline ("You're offline… N changes are saved on this device") or while changes need attention |
| `ConflictState` | explains a rejected change: the server's reason, that it is still saved on this device, and what to do |
| `useSyncState()` | the same derived state for custom UI |

## Shell (`platform/shell/`)

| Piece | Notes |
|---|---|
| `AppShell` | top bar (context eyebrow + `<h1>` page title + sync + account menu), offline/conflict banner, `<main id="main">`, skip link. **Exactly one** navigation variant is rendered per layout. |
| `useLayout()` | phone < 768 ≤ tablet < 1200 ≤ desktop (via `matchMedia`) |
| `navigation.ts` | the information architecture; role-aware (`navFor(role)`) |
| `BrandMark`, `BrandLockup` | vector capsule mark and wordmark for small sizes and light surfaces |
| `data-nav-id`, `data-nav-more` | stable hooks for tests and analytics |

## Auth (`platform/auth/`)

| Piece | Notes |
|---|---|
| `AuthLayout` | forest "stage" (layered planes with real perspective, decorative, `aria-hidden`) + form card; compact header on phones |
| `authMessages.ts` | `friendlyAuthError`, `friendlyInviteError`, `inviteErrorKind`: plain language, never server internals |

## Legacy bridge (temporary)

`platform/components/primitives.tsx` keeps its old API for un-redesigned screens: `Modal` is now a
native dialog with focus trapping, `Field` wraps its control in a `<label>`, `Input` uses
`.nv-input`, and `Toast` re-exports the new one. `constants.ts` maps `FONT`→system stack and
`GREEN`→`#0B6B50`. Delete these as screens move to the primitives above.

---

## Core product patterns (Phase 8 core experience)

Built from the primitives above; still presentation plus the one workflow each owns.

| Pattern | Where | Notes |
|---|---|---|
| **Operational rows** (`.nv-rows` / `.nv-row`) | Inventory, Customers, Reminders, Suppliers, Orders, Expiry | **One DOM for every width.** From 1000 px it is a table (`--cols` sets the grid); below, each row stacks as name + status, then one details line, then actions (right-aligned, thumb reach). `.nv-row--attention` adds a left accent. No desktop table is ever squeezed into cards. |
| `StockMeter` | Inventory | stock against reorder point (tick) and max; colour follows status; decorative (the numbers are text) |
| `toProductView()` | `features/inventory/model.ts` | **The single product model**: status, days of stock (`null` without a sales rate), suggested reorder (to max, only when at/below the reorder point), value at cost/retail, expiry band and value at risk. Dashboard, Inventory, Expiry, Analyst, Reports and Financials all use it, so they can’t disagree. |
| `AdjustStockDialog` | Inventory, Expiry | adjust_stock_idempotent; quick ±1/±10, reason chips, preview of the new count; `preset` for write-offs |
| `ReorderDialog` | Inventory, Price compare | real suppliers and recorded prices (the price source is stated), MOQ validation, creates a purchase order (offline-capable), then an explicit “Open WhatsApp to send”. Never claims anything was sent. |
| `SaleForm` | Sales screen, customer rows | customer search (Enter picks the top match) → product search → quantity steppers with stock checks → payment (native radios) → Record sale. Result: **“Sale recorded · Synced”** (success tone) vs **“Saved on this device · Pending sync”** (pending tone). `closeOnRecord` for quick sales. |
| `PriceCompare` | Suppliers › Price compare | options ranked by the order’s real total (MOQ-aware), then unit price, then lead time; the winner is the only card with depth 3; unknown fields say “Not recorded”; prices older than 30 days are flagged |
| `BarList`, `DayBars`, `downloadCsv` | `features/reports/charts.jsx` | HTML/CSS charts, 0 kB of library; values as text; `DayBars` has a screen-reader table and an optional previous-period reference line |
| Insight card (`.nv-insight--lead`) + list | Analyst | What happened · Why it matters · Recommended action · Estimated effect · Evidence, plus a link to where it’s resolved |
| Evidence strip (`.nv-evidence`) | Analyst | the recorded figures findings are built on |
| Steps (`.nv-steps`) | Order detail | done / unknown (dashed) / to-do states; used to show honestly what the app can and can’t see |
| `.nv-table` | Order lines | real `<table>` with caption, `scope` and a totals footer |

---

## Country-aware patterns (Phase 9)

Every per-country difference comes from `@/platform/country`, so screens never branch on a country
code. See [docs/country/](../country/README.md).

| Pattern | Where | Notes |
|---|---|---|
| **Money** | everywhere | `fmt(n)` / `money(n)` use the pharmacy's currency and locale. Use `moneyIn(n, currency)` for records that carry their own currency (supplier prices, orders) and `moneyTotals(rows, …)` for sums that may mix currencies. Never a bare `$`; USD reads **US$**. |
| **Dates** | everywhere | `tenantToday()`, `tenantDate()`, `tenantDateTime()`. "Today" is the pharmacy's business date, whatever the device clock says. |
| `OtherCurrencies` | Financials, Reports › Sales | An info alert listing sales recorded in another currency. They are shown next to the totals and never added in. |
| Currency-grouped `PriceCompare` | Suppliers › Price compare | One `ol.nv-compare[data-currency]` per currency, with an explanation when quotes mix currencies. The "best" flag appears only in a group that can be compared honestly. Quotes in a foreign currency show "priced in USD, not comparable" instead of a saving. |
| Country address fields | Customers, Settings | `getAddressFields(country)`: labels per country, stable keys, datalist suggestions (free text is always accepted). |
| Phone entry | Customers, Onboarding, Settings | `type=tel` and `phoneHint(country)`. `parsePhone` validates and stores E.164. `formatPhone` shows it grouped, and shows legacy values unchanged. |
| Payment chips | Sale form | `getPaymentMethods(config)`, in stable profile order; `paymentMethodHint` appears as a title. |
| `SettingsScreen` | Management › Settings (owner) | Tabs: General · Money · Contact · Registration. Online-only. The country and currency lock is explained, and a pre-sale country change needs a confirmation dialog. Regulatory fields carry a "Rules not yet verified" badge. Shows recent changes from the audit log. |

## Premium patterns (Phase 11)

| Pattern | Where | Rules |
|---|---|---|
| **Decision surface** (`.nv-decision` + `.nv-plane-decision` or `.nv-plane-critical`) | Dashboard top item | One per screen. It shows the tier overline ("Decide now"), title, body and one action. On phones the action goes full-width under the text; the text never shares a row with a button. |
| **Attention queue** (`.nv-queue`) | Dashboard | Tiers: Decide now → Risks → Opportunities → Housekeeping. Compact rows. The action sits right on wide screens and under the text on phones. |
| **Pulse strip** (`.nv-pulse`, `--stack`, `--4`) | Dashboard, Expiry, Analyst, Financials headline | Supporting figures as one instrument with dividers, not a grid of cards. On phones: label left, figure right. |
| **Activity timeline** (`.nv-activity`) | Dashboard recent sales, Sales today | A rail with dots, grouped by business day ("Today", "Yesterday", date), the amount right-aligned. |
| **Statement** (`.nv-statement`) | Financials | Ledger groups; label left, tabular figure right; `.is-total` rows; `.is-blank` rows say "Not recorded". |
| **Ranked comparison** (`.nv-compare` with `li.nv-compare__card`) | Price Compare | The best option is the decision surface. Others are compact ranked rows with a relative order-total bar. The facts line always states gaps ("Not recorded"). Availability shows words, never stored values. |
| **Urgency bands** (`.nv-urgency-1/2/3`) | Expiry | Weight and surface escalate: level 1 is critical and larger; level 3 is inset, dense and quiet. Colour is never the only signal. |
| **Insight brief** (`.nv-insight--lead`, `.nv-insight-list`) | Analyst | What happened → Why it matters → Recommended action → Estimated effect → Evidence. The lead is on a decision or critical surface; the others preview their action and expand in place. |
| **Command search** (`platform/shell/CommandPalette.tsx`) | Every workspace screen | Ctrl/⌘K, "/" or the top-bar button. Searches medicines, customers and role-filtered actions from this device's lists, so it works offline. A combobox with a listbox. Lazy-loaded (2.1 kB gzip). |
| **Fixed list grid** | Every `.nv-rows` list | The actions column has a **fixed width** in `--cols` (never `auto`), so every row shares one grid and columns line up. |
| **Phone page header** | Every `PageHeader` | The primary action sits beside the title; with two or more actions they take their own row. **No action is ever hidden on phones.** |
| **Chip and tab edge fade** | `.nv-chips`, `.nv-tabs` below 1000 px | A mask fade signals horizontal scroll without a scrollbar. |
| **Public site** (`pages/HomePage.tsx`, `pages/home.css`) | `/` | Scoped under `.nv-site`, lazy. A static CSS mesh, live product scenes labelled "Sample data", and scroll-world-style numbered chapters with a route rail. Stacks on phones; static with reduced motion. |
