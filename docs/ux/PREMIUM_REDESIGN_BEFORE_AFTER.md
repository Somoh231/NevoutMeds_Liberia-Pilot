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
