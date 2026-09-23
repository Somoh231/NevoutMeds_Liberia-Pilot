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
