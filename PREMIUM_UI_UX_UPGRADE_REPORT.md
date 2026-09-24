# Premium UI/UX second-pass upgrade: report

Date: 2026-09-24 · Branch: `phase8/ux-design-system` · Baseline: commit `263283b` (Phase 10)

This pass is a refinement, not a rebuild. The database, RLS, transaction and idempotency
semantics, offline queue, tenant isolation and currency handling are unchanged. Every
existing product flow still works, and all 18 regression suites pass (see
[Quality gates](#quality-gates)).

**Documents from this pass:**
- **Audit:** [docs/ux/PREMIUM_SECOND_PASS_AUDIT.md](docs/ux/PREMIUM_SECOND_PASS_AUDIT.md),
  with findings ranked P0–P3.
- **Screenshots:** [docs/ux/PREMIUM_REDESIGN_BEFORE_AFTER.md](docs/ux/PREMIUM_REDESIGN_BEFORE_AFTER.md),
  a before/after matrix at 360 px, 430 px and laptop width.
- **Design system:** [docs/design-system/](docs/design-system/): `TOKENS.md`, `COMPONENTS.md`
  and `README.md`.

## 1. Tools and skills actually used

| Tool | How it was used | What was taken from it |
|---|---|---|
| **UI/UX Pro Max** (plugin, enabled at project scope in `.claude/settings.json`) | `--design-system` for pharmacy-operations SaaS (variance 4, motion 3, density 8). `--domain ux` searches: nav active state, search no-results and autocomplete, number formatting, motion timing and easing, empty states, error announcement. `--domain chart` for alert prioritisation. | The dense-dashboard spacing, the *subtle* motion tier (120–250 ms, exit faster than enter), tabular numerals for figures, a visible query and an empty state in search, and never relying on colour alone. **Rejected:** its generated style (Neumorphism, a cyan palette, a testimonials landing pattern). The tool rates Neumorphism's accessibility risk as high, cyan would discard the brand's forest green, and fabricated testimonials were removed on purpose in Phase 8. |
| **21st.dev MCP** | `search` and `get_component` across command palettes, attention queues, bottom navigation, vendor comparison, split login, insight cards, dense data rows and activity timelines. Preview images were downloaded and inspected. | The patterns in §2. No 21st.dev code was copied: each pattern was re-implemented in the existing `nv-` CSS system with no new dependencies. |
| **scroll-world** (plugin, enabled at project scope) | Its composition model for the public site: numbered pinned chapters ("01 / 05"), eyebrow → title → body → tags, a route rail, linger pacing, reduced-motion and phone fallbacks, and safe areas. | The storytelling structure of the new home page. **Not run:** the paid video pipeline. It costs about $27 for 6 scenes (Monid/Higgsfield), produces about 90 MB of video that is wrong for 3G users, and its tools (`higgsfield`, `monid`, `ffmpeg`) aren't installed. Running it is the owner's decision. Live CSS product scenes are used instead, at 0 kB of media. |
| Local harness (`supabase/tests/lib/harness.mjs`, headless Chrome over CDP) | `ux_audit.mjs` measurements, the new `premium_shots.mjs` screenshot matrix, and the new `ui_premium.e2e.mjs` suite. | Before and after evidence at 360, 390, 430, 768, 1366 and 1920 px. |

## 2. 21st.dev patterns actually used

| Pattern (author on 21st.dev) | Where it landed |
|---|---|
| Command palettes (ddoemonn, rafa-porto, ephraimduncan, preetsuthar17, efferd, originui) | `CommandPalette.tsx`: grouped results (Actions, Go to, Medicines, Customers), an always-visible query, actions listed before typing starts, keyboard hints in the footer, and a translucent panel with a solid fallback. |
| Feature Comparison Table (7ovr) | Price Compare: the recommended supplier is highlighted on a decision surface with a trophy rank, and the other suppliers are numbered. |
| Insight Cards (arihantcodes) | Analyst evidence strip and the dashboard's "Today so far": tabular values with muted units. |
| Streaming Data Rows (rmahammad) | Inventory, Expiry and Sales rows: right-aligned tabular figures and status pills with an icon and a label. |
| Bottom Nav Bar (arunachalam) | Checked against the existing phone bottom nav, which already follows the pill active-state pattern, so no change was needed. |
| Split Login (hirael) | Auth: a calm editorial aside that shows sample product states instead of marketing claims. |
| Chrono Board (dhileepkumargm) | The activity timeline (`ol.nv-activity`) used by the dashboard's recent sales and by Sales today. |
| Stocks Dashboard and the sidebar pattern | Sidebar gradient, the raised pharmacy card, and overline section headings. |

## 3. Libraries: accepted and rejected

All sizes were measured with esbuild, gzip, with React external, in a scratch project (not
the repo).

| Library | Measured cost | Decision | Why |
|---|---|---|---|
| **React Three Fiber v8 + three** | **232.9 kB** | Rejected | Larger than the whole app (161 kB). WebGL drains battery and stutters on low-end Android, and the brief forbids it on operational screens. R3F v9 also requires React 19. |
| **@shadergradient/react** | **277.4 kB** | Rejected | Its only allowed use (marketing and auth) is achieved by a static CSS mesh gradient at 0 kB, which pauses for reduced motion and on phones. |
| **liquid-glass-react** | n/a | Rejected | Requires React ≥ 19, and the app runs React 18. Instead, one `backdrop-filter` material (`--nv-material-float`) is used on the command surface only, with an opaque `@supports` fallback. |
| **motion/react** (Framer Motion) | **43.4 kB** | Rejected | That's 27 % of the main bundle for effects that CSS transitions and keyframes already cover. |
| **motion/mini** | 3.9 kB | Not needed | Native Web Animations and CSS keyframes do the same work. |
| **Lucide** | already in the app | Kept | Every new icon comes from the existing tree-shaken set. `Menu` was added. |

**Result: no new runtime dependencies.**

## 4. Visual changes by screen

The per-screen table with screenshots is in
[PREMIUM_REDESIGN_BEFORE_AFTER.md](docs/ux/PREMIUM_REDESIGN_BEFORE_AFTER.md).

- **App shell:**
  - a lighter canvas;
  - a sidebar gradient;
  - the pharmacy card on a raised surface, with the role line "Owner · Liberia · USD";
  - overline nav headings;
  - a **search trigger** in the top bar (Ctrl/⌘K or "/"), labelled with the platform's
    shortcut;
  - edge fades on chip rows that scroll.
- **Command search (new):**
  - finds medicines (name or category), customers (name, or the last 3+ digits of a phone
    number), actions and screens;
  - works offline against data already on the device, and says so;
  - an honest empty state;
  - combobox and listbox semantics;
  - the list is filtered by role, so staff never see owner screens.
- **Dashboard:**
  - the list of equal-weight attention items is replaced by tiers: **Decide now** (on a
    decision surface), **Risks**, **Opportunities** and **Housekeeping**;
  - one "Today so far" pulse strip replaces three competing number cards;
  - recent sales form a timeline grouped by day;
  - the WhatsApp preview is visible, and its text is plain and professional ("Daily Report —
    {pharmacy}", no emoji).
- **Inventory:**
  - one fixed column grid, so Stock, Days, Expiry and Value align on every row;
  - a tabular stock figure with a muted unit;
  - consistent expiry cells (month and year, plus a note: "in N days" or the expiry date);
  - a compact phone header.
- **Sales:**
  - no overflow at 360 px;
  - a large tabular total with the item count and payment method;
  - lines animate in;
  - a success state with a drawn check (synced) or a cloud icon (saved on this device).
- **Price Compare:**
  - a ranked comparison, with the best recorded price on a decision surface;
  - order total and "vs what you pay";
  - a relative savings bar;
  - one facts list (minimum order, availability in words instead of `in_stock`, lead time,
    reliability, and "Price recorded · may be out of date");
  - the price moves under the supplier name on phones, so it is never clipped.
- **Expiry:**
  - progressive urgency: the expired and ≤7-day bands on stronger surfaces, and later bands
    quieter;
  - aligned columns;
  - "None expected" instead of "—";
  - the duplicate Write off button was removed.
- **Analyst:**
  - an evidence strip with exact precision (credit US$17.85 everywhere, not US$18);
  - a calmer priority card (a critical edge instead of a red wash);
  - collapsed findings preview their recommended action.
- **Financials:**
  - three headline figures (revenue, gross profit and margin);
  - a **statement layout** replaces the 10 identical KPI cards, with grouped ledger rows,
    right-aligned tabular figures and totals;
  - a "Not tracked yet — deliberately blank" group.
- **Reports:**
  - thin bars with a scale, the peak and a midline;
  - the previous-period line is drawn only when that period had sales;
  - a truthful caption either way;
  - one title.
- **Staff and Documents:** text raised to the 12 px floor; the Documents search and the
  Import file input now have labels; better empty states.
- **Auth:** the stage shows labelled sample product states (Decide now / Sale recorded ·
  synced / Offline), plus a short trust list: private to your pharmacy, works offline after
  sign-in, every change is recorded.
- **Public home page (rebuilt):**
  - forest-green brand identity;
  - a product preview on a tilted device, labelled "Sample data";
  - a proof strip;
  - a five-chapter scroll-world story (a pinned stage with a route rail on desktop, inline
    scenes on phones);
  - Lucide icons instead of emoji;
  - all placeholder and developer chips removed;
  - pricing content unchanged.
  The home page is lazy-loaded, and `client/src/styles.css` was removed.

## 5. Before and after screenshots

The matrix is 11 screens plus command search, each at 360 px, 430 px and laptop width,
using synthetic showcase data (`supabase/tests/seed_showcase.mjs`, local only):
- **Matrix:** [PREMIUM_REDESIGN_BEFORE_AFTER.md](docs/ux/PREMIUM_REDESIGN_BEFORE_AFTER.md);
- **Images:** `docs/ux/premium/before/` (36) and `docs/ux/premium/after/` (39), 6.1 MB of
  JPEG in total.

To regenerate them:
```
node supabase/tests/seed_showcase.mjs
node supabase/tests/premium_shots.mjs
```

## 6. Mobile results

Measured by `ux_audit.mjs` on the final build, with the before build (`263283b`) for
comparison:

| Check | Before | After |
|---|---|---|
| Price Compare at 360 and 430 px | content 435 px wide; the unit price clipped | fits the viewport (no pan, no clipping) |
| Dashboard attention items at 360 px | ~60 px text column, words broken mid-word, first item 900 px tall | full-width items, with the action below the text |
| Sale form at 360 px | fields and total bar past the card edge | contained |
| Inventory phone header | ~790 px before the first product | compact: the action sits beside the title, and sort sits inline with the filters |
| Text under 12 px (Staff / Documents at 430 px) | 12 / 13 elements | 0 |
| Unlabeled controls | 1 (Documents search) plus the Import file input | 0 |
| Command search trigger on phones | n/a | ≥ 44 px target (tested), and the panel fits a 360 px screen |

The phone header never hides actions. When a screen has more than one action, the actions
move onto their own row (`:has(> :nth-child(2))`).

Full audit numbers are in §9.

## 7. Accessibility

- **Labels:** the Documents search and the Import file input now have accessible names. The
  command search is a labelled `dialog` containing a `combobox` with
  `aria-activedescendant`, a `listbox` and `option` elements; its group names are exposed to
  screen readers through visually hidden text.
- **Type floor:** everything people read is ≥ 12 px (278 → 0 in the audit). Staff and
  Documents went from 9–11 px to 12 px; the home page, auth sample labels, count badges and
  keyboard hints went from 10–11 px to 12 px.
- **Targets:** there are 0 targets under 24 px (was 19). The Import file picker is a 44 px target.
- **Case:** labels that people read or copy (dates, "Best recorded price") use sentence case,
  not CSS uppercase. Uppercase is kept only on decorative overlines.
- **Colour is never the only signal:**
  - urgency uses surface, edge and type size as well as colour;
  - status pills pair an icon with a label;
  - the recommended supplier gets a rank and a text flag.
- **Motion:**
  - every motion token collapses under `prefers-reduced-motion`;
  - the hero mesh drift and device tilt are off for reduced motion and on phones;
  - the live dot pulses twice and then stops, so there is no endless pulsing while offline.
- **Focus:** the command input shows a field underline instead of a doubled outline. All
  other focus rings are unchanged.
- **Contrast:** 108 → 0 contrast failures across all audited pages (§9). This includes the
  legacy Staff and Import colours and the home-page call-to-action.

## 8. Performance and bundle size

`npm run build` on the final tree:

| Asset | Phase 10 (before) | After | Change |
|---|---|---|---|
| Main JS (gzip) | 160.37 kB | **161.17 kB** | +0.8 kB (within the ~165 kB target) |
| Main CSS (gzip) | 10.54 kB | 14.42 kB | +3.9 kB (surfaces, statement, compare, command, motion, file picker) |
| Command search chunk | n/a | 2.10 kB (lazy, loaded on first open) | new |
| Home page | 16 kB JS (with its CSS in the main bundle) | 6.13 kB JS + 4.37 kB CSS (lazy) | smaller; home-only CSS left the app bundle |
| PWA precache | n/a | 51 entries | unchanged behaviour |
| Third-party hosts | 0 | 0 | unchanged |
| New dependencies | n/a | 0 | none |

Adding every library the brief suggested would have added about 550 kB gzip (R3F + three
232.9, ShaderGradient 277.4, motion 43.4), more than three times the entire app.

## 9. Final UX audit

`supabase/tests/ux_audit.mjs` covers 131 page×viewport combinations: public, auth, 13 owner
screens and staff screens at 360, 390, 430, 768, 1366 and 1920 px. It ran on the Phase 10
build (`263283b`) and on the final build, with the same synthetic showcase data both times.

| Measure (sum over all 131 combinations) | Before | After |
|---|---|---|
| Pages that pan sideways | 3 | **0** |
| Clipped text | 21 | **0** |
| Text under 12 px | 278 | **0** |
| Contrast failures (< 4.5:1) | 108 | **0** (\*) |
| Unlabeled controls | 12 | **0** |
| Targets under 24×24 px (WCAG 2.5.8) | 19 | **0** |
| Emoji used as icons | 126 | 54 (\*\*) |
| Slow 3G: login usable | 4.46 s | 4.47 s |
| Slow 3G: transfer | 175 kB | 180 kB |
| Third-party hosts | 0 | 0 |

(\*) The full run on the final build found 24, all of them in legacy Staff and Import colours
(for example "Suspend" at 2.04:1). Those colours were darkened to AA values, and a focused
re-run at 360 px and laptop width (47 combinations) reported 0 flags of any kind.

(\*\*) 48 of these are the legacy category icons on Documents, and 6 are the "©" in the home
page footer. Replacing the Documents emoji is listed in §11.

**Fixes the final audit prompted:**
- **Home page:** "Request a demo" had dark text on green, and the skip link had dark text on a
  dark background, because `.nv-site a { color: inherit }` beat the button classes. The rule
  is now `:where(.nv-site) a`.
- **Text under 12 px:** the home-page scene labels, nav count badges and the ⌘K hint were
  raised to 12 px.
- **Tap targets:** the dashboard and Financials link-buttons now have a 24 px minimum height,
  as does Expiry's "Open Inventory". The Import file picker is now a 44 px target.
- **Staff:** the stat, avatar and action colours were darkened to AA contrast, and the
  remaining 11 px labels were raised to 12 px.
- **Documents:** the table scrolls inside its card at 360 px instead of clipping the
  "Actions" header.

## 10. Design-system changes

The canonical files are `client/src/platform/design/tokens/tokens.css`,
`client/src/platform/ui/ui.css` and `docs/design-system/`.

- **Surface roles** (new tokens): canvas → surface → raised → decision → critical. They are
  `--nv-canvas-light`, `--nv-plane-raised`, `--nv-plane-decision`, `--nv-plane-critical` and
  their edge and ring tokens, plus `--nv-material-float` (the only translucent material).
  The classes are `.nv-plane-raised`, `.nv-plane-decision` and `.nv-plane-critical`, each with
  a 3 px role edge.
- **Figures** (new): `--nv-text-figure-xl`, `--nv-text-figure-lg`, `--nv-text-figure` and
  `--nv-text-overline`, plus `--nv-tracking-figure` and `--nv-figure-features`
  (`"tnum" 1, "lnum" 1`). The classes are `.nv-figure*`, `.nv-overline` and `.nv-unit`.
- **Motion semantics** (new): `--nv-motion-enter`, `-exit`, `-expand`, `-select`, `-hover`,
  `-press`, `-success` and `-sync`, plus `--nv-press` and `--nv-enter-distance`, all
  collapsed for reduced motion. The keyframes are `nv-enter`, `nv-success-pop`,
  `nv-check-draw` and `nv-sync-turn`.
- **New patterns:**
  - `.nv-pulse` (the operational strip);
  - `.nv-statement` (ledger);
  - `.nv-decision` and `.nv-queue` (the attention tiers);
  - `.nv-activity` (the timeline);
  - `.nv-compare*` (the ranked comparison);
  - `.nv-urgency-1/2/3`;
  - `.nv-daybars` refinements;
  - `.nv-cmd*` and `.nv-kbd`;
  - `.nv-sale-done` and `.nv-success-mark`.
  All are documented in `COMPONENTS.md` → Premium patterns.
- **Removed:** the legacy `client/src/styles.css`, the old `.nv-evidence` CSS, the old brief
  list CSS, and the infinite `nv-dot--live` animation.

## Quality gates

These are the final full regression results on the local Supabase stack. The remote database
was not touched, and production was not reseeded or redeployed.

| Suite | Checks |
|---|---|
| ui_premium (new) | 18 |
| ui_core_flows | 81 |
| ui_foundation | 53 |
| ui_country_pilots | 46 |
| ui_import | 32 |
| ui_recovery | 26 |
| ui_offline_sale_stock | 25 |
| ui_offline_first | 21 |
| ui_staff_lifecycle | 17 |
| ui_workflows | 15 |
| ui_phase8_correctness | 14 |
| ui_owner_provisioning | 10 |
| api_staff_lifecycle | 47 |
| api_tenant_isolation | 41 |
| api_realtime_offline | 25 |
| SQL | 354/354 |
| Unit | 77 |
| Design tokens | 27 |

**All passed; 0 failures.**

After the final-audit fixes in §9, the suites covering the touched screens were re-run and
all passed:
- ui_premium, ui_staff_lifecycle, ui_import, ui_foundation, ui_core_flows, ui_workflows,
  ui_phase8_correctness and ui_offline_first (251 checks);
- the unit tests (77) and design tokens (27).

Two existing tests were changed deliberately:
- `ui_phase8_correctness` now compares the Analyst revenue numerically to the exact cent,
  because the screen now shows exact precision;
- the daily summary title "Daily Report — {pharmacy}" is kept, so test and user expectations
  stay the same.

## 11. Remaining visual opportunities

Items 1–3 of the original list (product detail, tablet, Staff and Documents) were done in the
final polish (§12). What remains:

1. **Customers** got the aligned grid, search deep-linking and the new tablet row, but no
   visual restyle of its detail sheet.
2. **scroll-world video:** a real fly-through needs the owner's budget decision (about $27+)
   and a delivery plan for 3G (for example, desktop-only, loaded on demand).
3. **CSS weight:** main CSS is now 16.07 kB gzip (it was 10.54 kB before the premium pass).
   Splitting the Financials, Price Compare, Analyst, Staff and Documents styles into their lazy
   chunks would win back about 3 kB.
4. **Dashboard WhatsApp preview:** could collapse on phones once pilot pharmacies confirm
   they rely on it.
5. **Full-page screenshots** of the pinned home story show the sticky stage at one chapter.
   That is a capture artefact, not a rendering bug; scrolling in a real browser works.
6. **Unused legacy primitives:** nothing imports `Avatar` or `Modal` from
   `platform/components/primitives` any more, so they can be deleted in a clean-up.

## 12. Final polish (commit `584a226`)

This pass was limited to the five known gaps. There were no new features and no changes to the
database, RLS, auth, offline, realtime, idempotency, multi-country or transaction behaviour.

| Area | What changed |
|---|---|
| **Product detail** (Inventory drawer) | It was seven identical grey tiles. Now it reads from top to bottom: <ul><li>an identity line (category · brand · unit) and badges;</li><li>an **On hand** block on the surface its status earns (critical, decision or raised), holding the stock figure, a full-width meter, the reorder scale, days of stock with the sales rate, the suggested reorder with its cost, and the **Reorder / Adjust stock** actions;</li><li>the expiry-risk alert;</li><li>statements for **Expiry** (date, band, batch) and **Cost and value** (unit cost, price and margin, value in stock);</li><li>**Stock history** with direction icons, notes, relative times with the full date on hover, and signed tabular deltas.</li></ul>Only recorded fields are shown; no running balance is invented. The side drawer is 440 px wide from 768 px up. |
| **Tablet** (768 / 820 / 1024 px) | **Measured problem:** the full column table switched on at a 1000 px viewport, but the rail or sidebar left only 878–962 px. The Inventory action column was clipped at 1024 px and at 1200–1280 px, Reminders overflowed, and Expiry was forced to 1052 px. **Fix:** lists are now a size container and choose their layout from their own width: card below 600 px, a **tablet row** (title, status and summary left, actions right) at 600–1039 px, and the table at 1040 px or more. Browsers without container queries keep the old behaviour. **Also:** <ul><li>the Dashboard at 600–999 px shows its figures side by side, and pairs Recent sales with the WhatsApp summary from 768 px;</li><li>chip rows fade at every width;</li><li>Expiry columns tightened by 30 px.</li></ul>Dialogs already centre from 768 px, and the rail was already sized; both were checked and left alone. |
| **Staff** | Every legacy inline style was removed (10–11 px labels, hard-coded hex colours, custom pills and buttons). The screen now has: <ul><li>PageHeader with an **Invite team member** primary button;</li><li>a pulse strip;</li><li>member cards: initials avatar (dark for owners, soft for staff), status badge with a dot, role badge, email, last activity, 7-day sales in a fixed column, and owner actions as system buttons (Offboard in danger text);</li><li>invitations as a list on the shared surface;</li><li>the audit log as an activity timeline;</li><li>EmptyState.</li></ul>The invite dialog uses FormFields and a real radio group for the role (with what each role can do). Confirmations use the system Dialog with a danger button. **Permissions and lifecycle calls are unchanged.** |
| **Documents** | The screen now has: <ul><li>PageHeader with Export index and Upload document;</li><li>Alert components for expired and expiring documents;</li><li>SearchInput and category chips with counts;</li><li>**document rows** with a file-type tile (PDF, image, spreadsheet or document, from the file name), a category icon, size and date, tags and note, an **expiry badge** (Expired / Expires in N days / Valid to), and **View / Download** icon buttons with full accessible names;</li><li>the upload dialog: a real button as the upload surface, the selected file with its type and size, and labelled fields;</li><li>the view dialog as a statement.</li></ul>Storage security and the upload rules (data layer) are unchanged. **Two honesty fixes:** <ul><li>the old **Delete** button only removed the row from the screen and toasted "Document deleted" while nothing was deleted, so it was removed;</li><li>the "Uploaded by" field showed a raw user ID, so it is no longer shown.</li></ul> |
| **Icons** | The emoji category icons (🏛 ✅ 🤝 📊 👤 📎) and the emoji action buttons (👁 ⬇ ✕ 📝 🚨 ⚠️ 📭) were replaced with the app's Lucide set: 8 icons added, about 0.2 kB each. The unused `buildDashboardKpis` (which still held 💰📦🔔💳📈) was deleted. The audit's emoji-as-icon count went from 54 to 5, all of them the "©" in the home footer. |
| **Support contacts** | The hard-coded fallback `support@nevoutmeds.com` was removed. **Email support** now appears only when `VITE_SUPPORT_EMAIL` is set. |

**Final visual audit** (`ux_audit.mjs`, extended this pass with 1024 px and eight detail
surfaces):
- **Scope:** 118 page×viewport combinations at 360, 430, 768, 1024 and 1366 px. They include
  the product detail, invite, upload and document-view surfaces at 360 and 1024 px.
- **Findings:** 0 sideways scroll, 0 clipped text, 0 text under 12 px, 0 contrast failures,
  0 unlabeled controls, 0 targets under 24 px.
- **Slow 3G:** login is usable at 4.46 s.
- **Legacy surfaces:** the four targeted areas no longer have legacy-looking surfaces. Staff and
  Documents use only system components and `nv-` classes, with no inline colour or type.

**Bundle** (`npm run build`):
- main JS **161.21 kB gzip**, +0.04 kB, under the ~165 kB target;
- main CSS 16.07 kB gzip (+1.65 kB for the product detail, team, documents and tablet tiers);
- command search 2.10 kB; home page 6.13 kB JS + 4.38 kB CSS;
- **no new dependencies**.

**Regression:**
- 15 UI and API suites, 471 checks, 0 failed;
- SQL 354/354, unit 77, tokens 27.

**Screenshots:** before and after at 360, 768, 1024 and 1366 px are in
[PREMIUM_REDESIGN_BEFORE_AFTER.md](docs/ux/PREMIUM_REDESIGN_BEFORE_AFTER.md) → Final polish,
with images in `docs/ux/premium/polish/`.

## Deployment status

**Deployed to production on 2026-09-24.** This deployment includes the Phase 10 onboarding
fixes, this premium upgrade and the final polish:
- **URL:** `https://nevout-meds-liberia-pilot.vercel.app`;
- **Commit:** `584a226`;
- **Bundle:** `index-CpTWfeTG.js`, identical to the locally built and scanned `dist/`;
- **Vercel deployment:** `k30br88vx`;
- **Rollback target:** `5tx6ir9e0`.

It was a frontend-only deployment. No migration, Edge Function or data change was made.

**Post-deployment checks:**
- signed-out production smoke **21/21**: routes, protected-route redirect, PWA manifest and
  icons, service worker activation and precache, no Demo Mode, correct Supabase project, no
  console errors;
- health check **HEALTHY** (0 pharmacies, all integrity checks at 0);
- home, login and the sign-in redirect show no sideways scroll at 360, 768, 1024 and 1366 px.

Signed-in production screens (the mobile and tablet shells, Inventory, Staff, Documents) could
not be opened on production, which holds no accounts. They were audited on a local build of the
same commit.

**Remaining human items:**
- set `VITE_SUPPORT_WHATSAPP` and `VITE_SUPPORT_EMAIL` in Vercel → Production, then redeploy;
- confirm that `demo@nevoutmeds.com` is read;
- the backup schedule with a restore test, and the named owners (see
  `PILOT_OPERATIONS_READINESS_REPORT.md`).
