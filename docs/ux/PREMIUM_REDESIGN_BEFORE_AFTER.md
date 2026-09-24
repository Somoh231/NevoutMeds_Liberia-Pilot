# Premium redesign: before and after

Same synthetic showcase data (`supabase/tests/seed_showcase.mjs`), same scripted screens and viewports (`supabase/tests/premium_shots.mjs`). **Before:** commit `263283b`. **After:** this branch.

Full-page captures; on phones the fixed bottom navigation appears where the viewport ended (a capture artefact). Images are downscaled JPEGs.

## Phone · 360 px

| Screen | Before | After |
|---|---|---|
| **Public home** | ![](premium/before/360__home.jpg) | ![](premium/after/360__home.jpg) |
| **Sign in** | ![](premium/before/360__login.jpg) | ![](premium/after/360__login.jpg) |
| **Dashboard** | ![](premium/before/360__dashboard.jpg) | ![](premium/after/360__dashboard.jpg) |
| **Inventory** | ![](premium/before/360__inventory.jpg) | ![](premium/after/360__inventory.jpg) |
| **Sale in progress** | ![](premium/before/360__sale-in-progress.jpg) | ![](premium/after/360__sale-in-progress.jpg) |
| **Customers** | ![](premium/before/360__customers.jpg) | ![](premium/after/360__customers.jpg) |
| **Price Compare** | ![](premium/before/360__suppliers.jpg) | ![](premium/after/360__suppliers.jpg) |
| **Expiry** | ![](premium/before/360__expiry.jpg) | ![](premium/after/360__expiry.jpg) |
| **Analyst** | ![](premium/before/360__analytics.jpg) | ![](premium/after/360__analytics.jpg) |
| **Reports** | ![](premium/before/360__reports.jpg) | ![](premium/after/360__reports.jpg) |
| **Financials** | ![](premium/before/360__financials.jpg) | ![](premium/after/360__financials.jpg) |
| **Command search** (new) | — | ![](premium/after/360__command-search.jpg) |

## Large phone · 430 px

| Screen | Before | After |
|---|---|---|
| **Public home** | ![](premium/before/430__home.jpg) | ![](premium/after/430__home.jpg) |
| **Sign in** | ![](premium/before/430__login.jpg) | ![](premium/after/430__login.jpg) |
| **Dashboard** | ![](premium/before/430__dashboard.jpg) | ![](premium/after/430__dashboard.jpg) |
| **Inventory** | ![](premium/before/430__inventory.jpg) | ![](premium/after/430__inventory.jpg) |
| **Sale in progress** | ![](premium/before/430__sale-in-progress.jpg) | ![](premium/after/430__sale-in-progress.jpg) |
| **Customers** | ![](premium/before/430__customers.jpg) | ![](premium/after/430__customers.jpg) |
| **Price Compare** | ![](premium/before/430__suppliers.jpg) | ![](premium/after/430__suppliers.jpg) |
| **Expiry** | ![](premium/before/430__expiry.jpg) | ![](premium/after/430__expiry.jpg) |
| **Analyst** | ![](premium/before/430__analytics.jpg) | ![](premium/after/430__analytics.jpg) |
| **Reports** | ![](premium/before/430__reports.jpg) | ![](premium/after/430__reports.jpg) |
| **Financials** | ![](premium/before/430__financials.jpg) | ![](premium/after/430__financials.jpg) |
| **Command search** (new) | — | ![](premium/after/430__command-search.jpg) |

## Laptop · 1366 px

| Screen | Before | After |
|---|---|---|
| **Public home** | ![](premium/before/laptop__home.jpg) | ![](premium/after/laptop__home.jpg) |
| **Sign in** | ![](premium/before/laptop__login.jpg) | ![](premium/after/laptop__login.jpg) |
| **Dashboard** | ![](premium/before/laptop__dashboard.jpg) | ![](premium/after/laptop__dashboard.jpg) |
| **Inventory** | ![](premium/before/laptop__inventory.jpg) | ![](premium/after/laptop__inventory.jpg) |
| **Sale in progress** | ![](premium/before/laptop__sale-in-progress.jpg) | ![](premium/after/laptop__sale-in-progress.jpg) |
| **Customers** | ![](premium/before/laptop__customers.jpg) | ![](premium/after/laptop__customers.jpg) |
| **Price Compare** | ![](premium/before/laptop__suppliers.jpg) | ![](premium/after/laptop__suppliers.jpg) |
| **Expiry** | ![](premium/before/laptop__expiry.jpg) | ![](premium/after/laptop__expiry.jpg) |
| **Analyst** | ![](premium/before/laptop__analytics.jpg) | ![](premium/after/laptop__analytics.jpg) |
| **Reports** | ![](premium/before/laptop__reports.jpg) | ![](premium/after/laptop__reports.jpg) |
| **Financials** | ![](premium/before/laptop__financials.jpg) | ![](premium/after/laptop__financials.jpg) |
| **Command search** (new) | — | ![](premium/after/laptop__command-search.jpg) |

## What changed, screen by screen

| Screen | Before → after |
|---|---|
| Public home | Generic template (blue gradients, emoji icons, visible “Placeholder:” chips) → brand identity, a live product preview labelled Sample data, a proof strip, scroll-world chapters with a route rail. |
| Sign in | Slogan panels → sample product states in restrained perspective, a static mesh atmosphere and true trust cues under the form. |
| Dashboard | One undifferentiated list + stacked big-number cards (P0 word-breaking at 360 px) → one decision surface, a tiered queue (Risks / Opportunities / Housekeeping), a pulse instrument and a day-grouped activity timeline. |
| Inventory | Per-row column drift and unit-weighted stock → one shared grid, prominent tabular stock figures, consistent expiry (month + countdown), a compact phone header. |
| Sale in progress | Fields and the total overflowed the card at 360 px → contained layout, a larger total instrument with an item count, lines that enter smoothly, a drawn-check confirmation. |
| Customers | Shared grid fix (fixed actions column); figures follow the new row typography. |
| Price Compare | Six-cell cards of “Not recorded”, the price clipped on phones, raw `in_stock` → a ranked comparison: the recommended supplier on the decision surface, relative order-total bars, readable availability, full-width names on phones. |
| Expiry | Same table for every band, misaligned “Recommended” column → urgency escalates by surface, weight and density; aligned columns; “None expected” instead of a dash. |
| Analyst | Red-washed lead card; other findings as bare toggles → a calm briefing (What happened → Why → Action → Effect → Evidence), action previews, a pulse instrument, consistent precision. |
| Reports | Duplicate title; a caption describing a line that wasn’t drawn; heavy bars → one title, an honest caption, thin bars on a scale with the peak marked. |
| Financials | Ten identical metric cards → a three-figure headline and a statement ledger with totals and “Not recorded” rows. |
| Command search | New: Ctrl/⌘K, “/” or the top-bar search. Medicines, customers and actions from this device’s lists; works offline; role-aware. |


## Final polish (after commit `24624a9`)

The same synthetic data, plus five local-only demo document records. Captured at 360, 768
(tablet), 1024 and 1366 (laptop) px. Images are in `docs/ux/premium/polish/{before,after}/`.

| Surface | Width | Before | After |
|---|---|---|---|
| Product detail (Inventory) | 360 | ![before](premium/polish/before/360__inventory-detail.jpg) | ![after](premium/polish/after/360__inventory-detail.jpg) |
| Product detail (Inventory) | 768 | ![before](premium/polish/before/tablet__inventory-detail.jpg) | ![after](premium/polish/after/tablet__inventory-detail.jpg) |
| Product detail (Inventory) | 1366 | ![before](premium/polish/before/laptop__inventory-detail.jpg) | ![after](premium/polish/after/laptop__inventory-detail.jpg) |
| Product detail, lower half | 360 | ![before](premium/polish/before/360__inventory-detail-bottom.jpg) | ![after](premium/polish/after/360__inventory-detail-bottom.jpg) |
| Product detail, lower half | 1366 | ![before](premium/polish/before/laptop__inventory-detail-bottom.jpg) | ![after](premium/polish/after/laptop__inventory-detail-bottom.jpg) |
| Staff | 360 | ![before](premium/polish/before/360__staff.jpg) | ![after](premium/polish/after/360__staff.jpg) |
| Staff | 768 | ![before](premium/polish/before/tablet__staff.jpg) | ![after](premium/polish/after/tablet__staff.jpg) |
| Staff | 1366 | ![before](premium/polish/before/laptop__staff.jpg) | ![after](premium/polish/after/laptop__staff.jpg) |
| Documents | 360 | ![before](premium/polish/before/360__documents.jpg) | ![after](premium/polish/after/360__documents.jpg) |
| Documents | 768 | ![before](premium/polish/before/tablet__documents.jpg) | ![after](premium/polish/after/tablet__documents.jpg) |
| Documents | 1366 | ![before](premium/polish/before/laptop__documents.jpg) | ![after](premium/polish/after/laptop__documents.jpg) |
| Inventory list at 1024 px (tablet) | 1024 | ![before](premium/polish/before/1024__inventory.jpg) | ![after](premium/polish/after/1024__inventory.jpg) |
| Dashboard at 768 px (tablet) | 768 | ![before](premium/polish/before/tablet__dashboard.jpg) | ![after](premium/polish/after/tablet__dashboard.jpg) |

| Surface | Before → after |
|---|---|
| Product detail | Seven identical grey tiles; actions below the fold on phones; history as bare text → identity line and badges; an **On hand** block on the surface its status earns (critical / decision / raised) with the stock figure, meter, reorder scale, days of stock, suggested reorder and both actions inside it; expiry and cost-and-value as statement ledgers; stock history with direction icons and signed tabular deltas. |
| Staff | Inline-styled legacy page (10–11 px labels, hard-coded colours, custom pills and buttons) → PageHeader, pulse strip, member cards with initials avatars, status and role badges, 7-day sales in a fixed column, owner actions as system buttons; invitations and the audit log on shared surfaces; the invite dialog uses labelled fields and a real radio group for the role. |
| Documents | Emoji category tiles and emoji action buttons, a 5-column table that scrolled sideways inside its card on phones, a fake Delete (removed only from the screen) → chips with counts, file-type tiles (PDF / image / sheet / document), a category icon from the app's icon set, an expiry badge, and View / Download icon buttons with full accessible names; the upload surface is a real button; the fake Delete is gone. |
| Tablet | Tables forced at 1000 px clipped their action column at 1024 px (and at 1200–1280 px with the sidebar); the dashboard at 768 px was the phone layout stretched → lists lay out by their own width (card / tablet row / full table); the dashboard at 600–999 px puts the figures side by side and pairs recent sales with the WhatsApp summary; chip rows fade at every width. |
