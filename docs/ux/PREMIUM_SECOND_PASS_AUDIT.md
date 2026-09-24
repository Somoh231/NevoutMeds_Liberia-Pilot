# Premium second-pass audit

Date: 2026-09-24 · Build audited: commit `263283b` (the Phase 10 build) on the local stack.

## Method

**Data.** The audit uses realistic synthetic data from `supabase/tests/seed_showcase.mjs`:
- 24 products covering every stock and expiry state;
- 3 suppliers with 37 prices;
- 10 customers;
- 46 sales over 14 days;
- reminders and an open order.

Earlier audits used 1 product and 1 customer. That hid the density and wrapping problems below, so
this pass re-measured everything.

**Evidence:**
- **Measurements:** `supabase/tests/ux_audit.mjs` measured 131 page×viewport combinations at 360,
  390, 430, 768, 1366 and 1920 px, with screenshots reviewed.
- **Comparison set:** a repeatable set from `supabase/tests/premium_shots.mjs`, stored in
  `docs/ux/premium/before/`.

**Tools used for the critique:**
- **UI/UX Pro Max:**
  - `--design-system` for pharmacy-operations SaaS, with variance 4, motion 3, density 8;
  - `--domain ux` for navigation, search, tables, motion, empty states and forms;
  - `--domain chart` for alert prioritisation.
- **21st.dev:** component research for the command palette, attention queue, bottom navigation,
  price and vendor comparison, split login, insight cards, dense data rows, and an activity
  timeline. Previews were inspected, and the patterns adopted are listed in
  `PREMIUM_UI_UX_UPGRADE_REPORT.md`.
- **scroll-world:** its storytelling and composition model (numbered pinned chapters, route
  rail, linger pacing, reduced-motion and phone fallbacks) for the public site.

**Rejected tool output.** UI/UX Pro Max's generated style for this product type was
**Neumorphism** with a cyan palette and a **testimonials** landing pattern. All three were
rejected:
- the tool itself rates Neumorphism's accessibility risk as high;
- a cyan palette would discard the recognisable NevOut forest green;
- fabricated testimonials were deliberately removed in Phase 8.

The dense-dashboard density, subtle motion tier and "avoid neon, AI gradients, motion-heavy"
guidance were adopted.

**Severity:**
- **P0:** usability or correctness (wrong, hidden or misleading information; broken layout);
- **P1:** major visual or interaction opportunity;
- **P2:** polish;
- **P3:** experimental.

## Answers to the brief's questions (current state)

| Question | Answer |
|---|---|
| Does it look expensive? | The **application** mostly does: calm canvas, restrained depth, honest data. The **public home page does not**. It reads as a generic startup template: blue/teal gradients unrelated to the brand, emoji as icons, visible "Placeholder:" chips and developer notes. |
| Is it distinctive? | Partly. The forest/green identity is strong on auth and the sidebar, but it disappears on the home page and in the dense screens (flat white cards everywhere). |
| Is the hierarchy obvious? | On Inventory, Expiry and the Analyst priority card, yes. **Dashboard, Financials and Price Compare** give most items equal weight. |
| Is it calm? | Yes, except the Analyst priority card (full red wash) and the dashboard's stack of big numbers. |
| Is the density intentional? | Inventory and Expiry, yes. **Financials** (10 identical metric cards), **Price Compare** (a repeated 6-cell grid of "Not recorded"), and the **phone inventory header** (half the screen before the first product) are not. |
| Are actions obvious? | Yes, with one gap: there is no quick way to *find* a medicine or customer from anywhere. |
| Are cards helping? | Not on Financials, the dashboard "Today so far", or Price Compare, where cards fragment comparisons. |
| Are states differentiated? | Sync states: yes. Expiry urgency: mostly by badge colour alone. |
| Is it still an admin template anywhere? | The home page; Financials' card grid; the legacy-styled Staff and Documents screens (10 px labels). |
| Is there unnecessary chrome? | Duplicate chart titles on Reports; duplicated full-width order buttons on Price Compare. |
| Does mobile feel purpose-built? | The bottom nav and sheets do. The **dashboard attention items and Price Compare break at 360 px** (P0). |
| Does each screen have a focal point? | Dashboard: split between the attention list and the numbers. Financials: none. Price Compare: the recommendation, but it is clipped on phones. |

## Findings

### P0: usability / correctness

| # | Screen | Finding | Evidence |
|---|---|---|---|
| P0-1 | Dashboard, 360–430 | Attention items put the action button beside the text, so the text column collapses to ~60 px and words break mid-word ("produc / ts", "criticall / y low"). The first item is 900 px tall. | `360__owner-dashboard.png` |
| P0-2 | Price Compare, 360–430 | The comparison content is 435 px wide in a 360 px viewport. The **unit price, the decision figure, is clipped** ("US$"), and the inputs run off the card. | `360__owner-suppliers.png`; the audit's overflowX list |
| P0-3 | Price Compare | Availability shows the raw database value `in_stock`. | `laptop__owner-suppliers.full.png` |
| P0-4 | Sales, 360 | The customer and product search fields and the total bar extend past the sale card's edge. | `360__owner-sales.full.png` |
| P0-5 | Reports | The caption says "The line is the previous period's daily average", but no line is drawn (it is omitted when the average is 0), so the sentence describes something that isn't there. | `laptop__owner-reports.full.png` |
| P0-6 | Home (public) | Placeholder and developer text is visible to the public: "Placeholder: Ministry / Regulator badge", "Placeholder: Partner pharmacies", "Placeholder: Distributor network", and footer chips "Blue/green healthcare palette" and "Responsive SaaS UI". | `laptop__home.full.png` |
| P0-7 | Dashboard | The WhatsApp summary brands itself "Nevoutmeds"; the footer points to "Analytics", but the screen is called "Analyst". | `laptop__owner-dashboard.full.png` |
| P0-8 | Documents / Import | The document search has a placeholder-only label; the Import file input is unlabeled. | ux_audit `unlabeled` |

### P1: major visual / interaction opportunities

| # | Screen | Finding | Direction |
|---|---|---|---|
| P1-1 | Dashboard | One undifferentiated list mixes stock-outs (decide now), expiry and reminders (risks), cheaper prices (opportunity) and missing reorder levels (housekeeping). "Today so far" is three stacked big-number cards competing with the decisions. | A tiered **attention queue**: decide-now items on a decision surface; risks and opportunities as compact queues; one **operational pulse** strip for the numbers; recent sales as a timeline. |
| P1-2 | Inventory | Column positions differ per row: rows with a Reorder button shift the Stock, Days, Expiry and Value columns about 70 px. The stock figure has the same weight as its unit text, and expiry mixes "3 d" and "Jun 2027". | One shared column grid; the stock figure is prominent and tabular with the unit muted; consistent expiry cells. |
| P1-3 | Inventory, phone | The header (title, summary, Add product, search, chips, sort) uses ~790 px before the first product. | A compact header row with the primary action beside the title; sort inline with the filters; an edge fade on the scrolling chips. |
| P1-4 | Price Compare | Each supplier is a card with a 6-cell grid, mostly "Not recorded". Comparing means reading down, and there are three full-width order buttons. | A **ranked comparison**: suppliers as rows, the recommended row as the decision surface, a savings bar relative to the current cost, missing data summarised once, MOQ and lead-time warnings, one order action per row. |
| P1-5 | Expiry | Urgency is carried by badge colour; every band is the same table. The "Recommended" header is misaligned with its content, and many "Value at risk" cells show a bare "—". | **Progressive urgency**: the expired and ≤7-day bands on stronger surfaces with larger type; later bands denser and quieter; "None expected" instead of "—"; aligned columns. |
| P1-6 | Analyst | The other six findings do carry the full brief, but it is hidden behind bare one-line toggles with no preview of the action. The priority card is a full red wash with a heavy full-width button. Credit rounds to "US$18" here but "US$17.85" elsewhere. | Every finding reads as the same brief (What happened → Why → Action → Effect → Evidence); collapsed rows preview their action; the priority card is calmer (a decision surface with a critical edge only); consistent money precision. |
| P1-7 | Financials | Ten identical metric cards: KPI-card soup. | A **statement layout**: grouped ledger rows with right-aligned tabular figures and section totals, like a finance product. |
| P1-8 | Reports | Heavy block bars without a scale; the title is duplicated. | Thin bars with a baseline, a max-scale label and the previous-period line when it exists; one title. |
| P1-9 | Global | No way to jump to a medicine, customer or action from anywhere. | A lightweight **command / search surface** (Ctrl/⌘K, "/" or the search button), offline-aware, keyboard-accessible. |
| P1-10 | Home (public) | Generic template: blue gradients, emoji icons, repeated filler copy ("Fixable with better signals…" ×5), and a hero that doesn't show the product. | Rebuild on the brand system: a forest/green identity, a real product preview, a scroll-world-style pinned story, honest copy, and reduced-motion and phone fallbacks. |
| P1-11 | Staff / Documents | Legacy inline styles: 10 px labels (below the 12 px floor) and different card language. | Move the text to the type scale and the shared surfaces. |

### P2: polish

| # | Finding |
|---|---|
| P2-1 | Typography: headings, figures and captions use one family and one weight step. Metric figures could be tighter (tabular, lining, tighter tracking) and overlines more consistent. |
| P2-2 | Depth: every card uses depth-1. The Canvas → Surface → Raised → Decision → Critical roles exist implicitly but aren't tokens, so screens improvise (red washes, green glows). |
| P2-3 | Motion: durations are tokenised but have no semantics (enter, exit, success, sync, selection, press), and press feedback varies by component. |
| P2-4 | The sync pill on phones is an unlabeled dot when Synced (the label is visually hidden). It is legible to screen readers, but ambiguous at a glance. |
| P2-5 | Chip rows scroll horizontally without an edge cue. |
| P2-6 | The phone dashboard puts "New sale" as a separate row; it could sit in the greeting row. |
| P2-7 | Recent sales repeat the date on every row. |

### P3: experimental

| # | Idea | Decision |
|---|---|---|
| P3-1 | WebGL (React Three Fiber) hero | **Rejected:** 232.9 kB gzip measured, more than the whole app. |
| P3-2 | ShaderGradient atmosphere on auth / the hero | **Rejected:** 277.4 kB gzip. A static CSS mesh gives the look at 0 kB. |
| P3-3 | Liquid-glass surfaces | **Library rejected** (needs React ≥19). A restrained `backdrop-filter` material, with a solid fallback, is used only on the command surface. |
| P3-4 | scroll-world video fly-through | **Not generated:** paid pipeline (~$27+ for 6 scenes, ~90 MB of video), tools absent, and wrong for 3G. Its composition model is used with live CSS product scenes instead. |

## What is already good (keep)

- **Honest data everywhere:** "Not tracked — deliberately blank", sample-data labels, no invented
  figures.
- **Sync states:** first-class tones, the offline banner, and conflicts that never disappear
  silently.
- **Mobile shell:** a 5-item bottom nav with safe-area insets, the More sheet, and a dialog that
  becomes a sheet.
- **Accessibility baseline:** 0 contrast failures, visible focus, labelled controls (except
  P0-8), and reduced motion honoured.
- **Performance:** 160 kB gzip main JS, 0 third-party hosts, login usable at 4.5 s on slow 3G.
