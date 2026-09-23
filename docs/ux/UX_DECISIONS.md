# UX decisions: Phase 8 foundation

Each decision cites the audit finding it answers (see [UX_AUDIT.md](UX_AUDIT.md)).

## 1. One shell per device class, never a shrunken desktop

| Width | Shell | Navigation |
|---|---|---|
| < 768 px (phones) | top bar + **bottom bar** | Dashboard · Inventory · Customers · Reminders · **More** (sheet) |
| 768–1199 px (tablets, small laptops) | top bar + **88 px rail** | all destinations, icon + full label, grouped by separators |
| ≥ 1200 px (laptops, desktops) | top bar + **256 px sidebar** | grouped, labelled sections + pharmacy identity card |

Only the variant for the current width is in the DOM (`useLayout()`), so screen readers and tests
never meet a hidden duplicate navigation. Labels are identical at every size ("Inventory" is never
"Stock" on one device and "Inventory" on another).

**The exact phone-width fix (P0-1).** The old workspace forced a 533 px layout on every phone,
because of a fixed 214 px sidebar plus a header row of five fixed-width buttons. Now:

1. The sidebar does not exist below 768 px; the bottom bar is `position: fixed` and inside the
   viewport.
2. The header's five buttons became one sync pill (icon-only when all is synced) and one avatar
   menu.
3. The grid is `minmax(0, 1fr)` columns, so no child can force the page wider.
4. Legacy screens get the shell's page padding through `.nv-screen`, and the three screens with
   fixed layouts were given flexible grids. The Inventory table scrolls inside its own card.
5. Dialogs are bottom sheets that can never be wider than the screen.

Result, measured: **0 px horizontal pan on all 9 workspace screens and 5 auth pages at 360, 390,
430, tablet, laptop and desktop** (`ui_foundation.e2e.mjs`, 84 page×viewport pairs).

## 2. Information architecture

Grouped by the job the pharmacist is doing, not by database table:

| Group | Destinations | Who |
|---|---|---|
| **Operations** | Dashboard · Inventory · Customers · Reminders | everyone |
| **Procurement** | Suppliers (price compare, orders) | everyone |
| **Insights** | Financials · Analytics | owner / admin |
| **Management** | Staff · Documents · Import data | owner / admin |
| Account menu | Help & feedback · Import data (owner) · **Admin console (platform admin only)** · Sign out | — |

* **Staff never see owner features, not even greyed out.** Their navigation is five calm items.
  If they reach an owner screen anyway, it says so without naming an invented person (the old
  message said "Contact John Kamara").
* **The platform admin console is not part of a pharmacy's navigation.** It lives in the account
  menu, visibly separate, because it acts across pharmacies.
* **Phone primary bar** = the four operations screens. Suppliers and owner tools are one tap away
  under More.
* **Sales.** The audit found recording a sale is buried in Customers (P1-4). There is no Sales
  screen yet, so the bar does not pretend there is one. When the Sales screen lands (next block),
  it takes a primary slot and Reminders moves under More. The slot order was chosen with that in
  mind.
* Names kept from the existing product (Dashboard, Inventory, Customers, Financials…), because
  staff already know them. "Price Compare", "Purchase Orders", "AI Analyst", "Reports" and
  "Cash Flow" become separate destinations only when those screens exist; navigation must never
  point at nothing.

## 3. One header, one account location

* The duplicated brand, the three spellings of the product name, the two sign-out controls and the
  "Public Homepage" link are gone (P1-2, P1-3, P2-2, P2-3).
* The top bar shows context in an eyebrow (the pharmacy name on phones and tablets, the group on
  desktop), the page title as the page's single `<h1>`, the sync pill, and the account menu.
* The pharmacy's identity (initials mark, name, the user's role) sits at the top of the desktop
  sidebar. That is where "whose data am I looking at?" is answered.
* **Sign-out lives in exactly one place on every device: the account menu.**

## 4. Honest connectivity, everywhere

The sync pill was the only offline indicator, and on a phone it would have been easy to miss. Now:
an **offline banner** runs under the top bar on every screen while offline ("You're offline. Keep
working — N changes are saved on this device and will sync automatically"). A **conflict banner**
appears when the server rejected a change, and the pill's panel explains each one
(`ConflictState`). Phase 6 wording is preserved exactly ("Offline", "Waiting to sync",
"Needs attention", "Synced").

## 5. Auth: calm, fast, explicit about every state

| State | What the user sees |
|---|---|
| Sign in | email, password (show/hide), Enter submits, "Forgot your password?" right below |
| Wrong password / banned / rate-limited / offline | plain-language alert (`friendlyAuthError`); never a raw server message |
| **Session expired** (not signed out on purpose) | "Your session ended. Sign in again — work saved on this device is kept." |
| **Suspended / removed** | "Your access is paused…" / "You no longer have access…" |
| Owner sign-up | name, pharmacy, email, password (8+); if email confirmation is required: "Check your email" |
| Forgot password | never reveals whether the address has an account |
| Reset link: checking → **expired/invalid** → form → done | each is its own screen with the one useful next step |
| Invitation: **missing code**, **invalid**, **expired**, **cancelled**, **already used**, **wrong email**, **already in a pharmacy** | a specific title and next step (e.g. "Sign out and use the invited email") |
| Invitation: sign in or create account → joining → in | tabs, then progress, then the workspace |

No implementation words reach normal users (Supabase, JWT, RLS, tenant, service role). The
misconfigured-build screen keeps one line addressed to "the person who set this up".

**Bug found and fixed while testing this:** accepting an invitation through the UI hung on
"Confirming your invitation…" forever. The server had accepted it, but the effect cancelled
itself (it depended on its own `busy` flag). This predates the redesign (it is in
`pre-phase8-hardened`) and was invisible because the API suite calls the RPC directly. It is now
covered end to end in the browser.

## 6. Spatial language: where depth is allowed

| Surface | Treatment |
|---|---|
| Tables, lists, forms, sidebar | flat to depth 1; no lift, no tilt |
| Metric cards, elevated panels | depth 2, top-light gradient |
| Interactive cards, primary buttons | 1 px lift on hover (mouse only), sink on press |
| Selected tab / nav item | rises out of an inset track; inner highlight + ring |
| Menus, sync panel | depth 3, pop from the anchor |
| Dialogs, sheets, toasts | depth 4; dialogs settle with a 4° perspective, sheets rise from the bottom |
| Auth stage | the one "scene": three layered planes in real 3D perspective, lit from the top-left, decorative |
| ActionCard | ≤2.5° pointer tilt: fine pointer only, never touch, never with reduced motion |

## 7. Performance decisions

* Sora from Google Fonts (6 weights, third-party, unavailable offline) was replaced by the system
  stack.
* Marketing page, onboarding, reset, invitation and every non-dashboard screen are separate chunks,
  precached by the service worker so they still open offline.
* Result: initial JS **164.05 → 152.69 kB gzip**, initial JS+CSS **166.02 → 161.06 kB**.

## 8. Deliberately not done in this block

Individual screen redesigns (tables → responsive card lists, emoji in screen content, legacy 9–11 px
labels inside screens, the Sales screen, locale and currency). They are the next block. The
foundation makes each one a matter of composing primitives.

---

# Core product experience (Phase 8, second block)

## 9. One product model, everywhere
`toProductView()` derives every stock figure: status, days of stock, suggested reorder, value,
and expiry band and value at risk. The Briefing, Inventory, Expiry, Analyst, Reports and
Financials therefore cannot disagree. Rules changed on the evidence:
* **"Set levels", not "Overstock"**, when no reorder point or maximum is recorded (audit P2-4).
* **Running out outranks expiring.** A critically low product that also expires soon is labelled
  critical; its expiry exposure still appears in Expiry alerts. The first cut of this block got
  this backwards and hid a critically low antibiotic from the restock list; the Gate A flow test
  caught it.
* **Reorder is quantity-driven**: suggested whenever stock is at or below the reorder point,
  whichever status wins the label.
* **No invented expiry.** Products without a recorded date used to be given 2099-12-31. They now say
  "No expiry recorded" and are never counted as at risk.

## 10. Morning briefing, not a metric board
Order: what needs attention → what's at risk → what changed → what to do next.
* Attention items are computed, ranked (sync conflicts, stock-outs, expiry, due refills, reorder
  point, credit over limit, cheaper supplier price, products without levels), and each has one
  action that opens the exact filtered view (`navigate(screen, params)`).
* **Only the most urgent item gets depth 3** (ActionCard with a tone edge). The rest are flat rows.
* Only three figures remain, each tied to a decision: sales today (with 30 days for owners),
  customer credit, and money in stock with the restock cost. There is no revenue chart on the
  briefing; trends live in Reports.
* "New sale" is one tap from the briefing.

## 11. Sales: the counter's fastest path
* A **Sales** destination (phone primary bar: Dashboard · **Sales** · Inventory · Customers ·
  More; Reminders moved under More) and a quick "Sale" on every customer row.
* Customer search and product search, where **Enter picks the top match**; stepper quantities;
  stock is checked before submit; payment uses native radios limited to the five methods the
  server accepts.
* Every sale belongs to a registered customer because the server requires `customer_id`. There's
  no invented "walk-in" record; registering is one tap away.
* **Honest outcome.** "Sale recorded · Synced" (success tone) and "Saved on this device · Pending
  sync" (pending tone) are different words, colours and icons, verified by B3/B4.
* Semantics unchanged (`record_purchase_idempotent`). The success message no longer waits for
  background refetches, which offline could take several seconds of retries.

## 12. Customers and reminders
* No invented defaults: gender and county were pre-set to "Female" and "Montserrado" and silently
  saved. They are now blank unless the pharmacist records them (B8 checks the server).
* Credit is visible but calm: a neutral badge, and a warning only when over the recorded limit.
  The detail states that repayments can't be recorded yet.
* Recorded allergies are shown when a sale is made for that customer.
* Reminders are grouped by next action (overdue, due today, upcoming, pending sync, reminded).
  **"Open WhatsApp" and "Mark as reminded" are separate steps**; delivery is never claimed.
  Delivery failure isn't knowable, and the screen says so.
* **Pre-existing bug fixed:** reminders were merged into customers by an effect that ran only when
  reminders loaded; any later customer refresh wiped them (the dashboard always showed 0 due). They
  are now derived.

## 13. Procurement: compare → choose → order
* **Price compare ranks by the order's real total** (a lower unit price with a 500-unit minimum
  can be the dearer choice), then unit price, then lead time. The winner is the only card with
  depth 3 and a "Best recorded price" flag.
* **Weak data is flagged, not hidden**: a single quote ("nothing to compare"), prices older than 30
  days, and "Not recorded" for delivery cost, reliability, availability and MOQ.
* The supplier directory no longer shows an invented fallback list or invented ratings (4.6★,
  96 % on-time, "Net 7"). Pharmacists can add suppliers and record prices (online-only, labelled).
* Orders show only statuses the database records. The progress view says what the app can't see:
  whether the WhatsApp message was sent, and receiving, which isn't implemented. There's no fake
  "received" button.
* Order creation now uses the idempotent RPC through the offline queue, so it works offline as
  "Pending sync".

## 14. Expiry alerts
Groups: Expired · Urgent (≤7 d) · ≤30 d · 30–60 d · 60–90 d, with batch, quantity, date, value at
risk (from recorded sales rates) and one recommendation. Available actions are real ones:
dispense first, hold the reorder, and **write off** (the stock dialog pre-filled with the whole
expired quantity). Transfers and supplier returns aren't supported and aren't offered.

## 15. Analyst (not "AI Analyst")
The findings are deterministic rules over recorded data, so the screen is called **Analyst** and
says so. Each finding states what happened, why it matters, the recommended action, the estimated
effect and the evidence, with a link to where it's resolved. New rules: stock-out before resupply
(days of stock vs supplier lead time), slow stock, week-on-week sales change, and supplier savings.
Corrected: "days of cover" now divides stock at cost by cost of goods, not revenue.

## 16. Reports and cash flow
* Reports: Sales (vs previous period), Products & margin, Inventory, Purchases, Suppliers, Customers
  & credit, Expiry. Period select, keyboard tabs, CSV export, HTML/CSS charts with text values and
  a screen-reader table. No chart library.
* Cash flow & financials: money in (split into paid now vs on credit), cost of goods and margin,
  where money is tied up (credit, stock, slow stock), money going out soon (open orders, reorder
  needs, labelled as needs, not debts), and a "not tracked yet" block explaining why no cash
  balance or projection is shown.

## 17. Test mechanics changed (assertions unchanged)
The redesign changed labels and controls, so four existing suites got new selectors or fallbacks,
never weaker assertions:
* sign-out through the account menu;
* the customer form via `type="tel"` and "Register customer";
* the sale via product search instead of a `<select>`;
* navigation via `data-nav-id` instead of button text, which now carries alert counts.
