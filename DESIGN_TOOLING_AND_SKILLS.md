# NevOut Meds — Design tooling, skills and MCPs

Phase 8, Part A. This records what is available in the environment, what was selected, and — just as
importantly — what was **rejected and why**. The governing constraint is unusual and must not be
forgotten: this product runs on low-end Android phones over expensive, intermittent 3G in Liberia.
A tool that adds runtime weight has to earn it.

## 1. What the environment actually offers

| Capability | Available? | Notes |
|---|---|---|
| Claude skills for design systems / Storybook / visual regression | **No** | `SearchSkills` for "design system", "ui components", "accessibility testing", "playwright visual regression", "storybook", "tailwind design tokens" returned **no results**. Nothing to install. |
| `vercel:shadcn` skill | Yes (enabled) | Guidance for shadcn/ui — relevant only if we adopt Tailwind + Radix. |
| `vercel:react-best-practices` skill | Yes (enabled) | A TSX review checklist; useful after component work. |
| `dataviz` skill | Yes (enabled) | Chart design guidance — directly useful for the six product pillars. |
| `artifact-design` / `artifact-diagramming` | Yes | For artifacts, not for this application's source. |
| Figma MCP / design-file access | **No** | No Figma connector in this session. Designs will be defined in code + documentation. |
| Headless Chromium | **Yes** | `ms-playwright` cache already present (chromium-1234) and used by the existing browser suites via CDP. |
| Docker / local Supabase | Yes | Used throughout. |

**Conclusion:** there is no design-specific skill or MCP worth installing. The useful capability
already present is the headless browser, which the existing 102 UI checks already drive.

## 2. Decisions

### Selected

| Tool | Source | Version | Purpose | Why it was chosen | Where used |
|---|---|---|---|---|---|
| **CSS custom properties + typed token module** | in-repo | — | single source of truth for colour, type, spacing, radius, elevation, motion | Zero runtime cost, works with the existing inline-style code, and can be adopted screen by screen without a rewrite | `client/src/platform/design/tokens/` |
| **In-repo primitive library** | in-repo | — | Button, Input, Select, Card, Dialog, Table, Badge, Alert, Toast, EmptyState, Skeleton, StatusPill | The app already has 11 ad-hoc primitives; consolidating them is the actual fix. No new dependency | `client/src/platform/ui/` |
| **Headless Chromium via CDP** | already installed | chromium-1234 | functional + visual regression at 360/390/430/tablet/desktop | Already proven in this repo; no new tooling to learn or ship | `supabase/tests/*.e2e.mjs` |
| **`dataviz` skill** | Anthropic (enabled) | — | chart form, colour and accessibility rules for the six pillars | Prevents inventing vanity charts; matches the "no fake AI, no invented numbers" rule | chart work in Phase 8 |
| **`vercel:react-best-practices` skill** | Vercel plugin (enabled) | — | component review pass | Cheap quality gate after each redesign group | after component batches |

### Rejected, with reasons

| Candidate | Verdict | Reason |
|---|---|---|
| **Tailwind CSS** | **Rejected for now** | A full migration of 26 inline-styled screens mid-hardening is high-risk churn with no user-visible gain. Tokens as CSS variables give us consistency without a build-time rewrite. Revisit only if the team grows. |
| **shadcn/ui** | **Rejected** | Requires Tailwind + Radix + a component-copy workflow. Adopting it would mean two styling systems during a long migration — exactly the "overlapping UI frameworks" the brief warns against. |
| **Radix primitives** | **Deferred, targeted** | Genuinely better focus-trapping and ARIA for Dialog/Popover/Tooltip. Worth adding *only* for those primitives (a few kB each, tree-shakeable) if hand-rolled accessibility proves insufficient. Not a blanket adoption. |
| **Storybook** | **Rejected** | Heavy for a single-developer pilot; a static "component gallery" route in the app gives the same benefit at a fraction of the cost. |
| **MUI / Chakra / Ant** | **Rejected** | Each would add 100 kB+ gzip and impose a visual identity. The brief explicitly asks for something that does not look like a generic admin template. |
| **Recharts / Chart.js / D3** | **Rejected for now** | The existing charts are hand-rolled SVG at near-zero cost. A chart library would be one of the largest items in the bundle. Revisit only for a genuinely complex visualisation. |
| **`@playwright/test`** | **Deferred** | The existing CDP harness already drives real Chromium, including network disconnection and `Page.crash` — things Playwright would not do better here. Adding it means a second test runner. Reconsider if visual-diff tooling becomes the bottleneck. |
| **`@axe-core/playwright`** | **Deferred with intent** | Automated a11y checks are wanted. Plan: run `axe-core` **from the existing CDP harness** (inject the script, evaluate) rather than adopting a new runner. |

## 3. Reusable knowledge kept in the repository

So future sessions do not re-derive any of this:

```
docs/design-system/     — tokens, components, patterns, accessibility rules
docs/ux/                — UX audit findings, navigation decisions, mobile notes
client/src/platform/design/tokens/  — the tokens themselves (typed + CSS variables)
client/src/platform/ui/             — the shared primitive components
```

## 4. Budget this work must respect

Carried forward from Phase 5/6 and non-negotiable:

* main bundle ≤ **~165 kB gzip** (currently 163 kB) — any increase must be justified and split;
* **zero** background polling (measured: 0 requests in a 45 s idle window);
* offline start-up and the durable queue must keep working exactly as tested;
* every redesign group is followed by re-running the 467 functional checks.

---

## 5. Re-evaluation for the foundation block (measured, not assumed)

Before building the foundation, every candidate was bundled in isolation with esbuild (minified,
production React), and its **incremental gzip cost over a bare React + ReactDOM bundle (44.6 kB)**
was measured with a realistic usage sample:

| Candidate | What was bundled | Incremental gzip | Verdict |
|---|---|---|---|
| **lucide-react 1.47.0** (ISC) | 23 named icons | **+3.9 kB** | **Installed.** Replaces emoji in all chrome (emoji are read aloud by screen readers and render as blank boxes on older Android). Only named imports, all through `client/src/platform/ui/icons.ts`. |
| Radix UI (dialog + dropdown-menu + tooltip) | 3 primitives | +29.2 kB | **Rejected.** Native `<dialog>` gives focus containment, an inert background, Esc, and the top layer for 0 kB. We add focus return and Tab wrapping (about 40 lines). Proven by `ui_foundation.e2e.mjs`. |
| Motion (`motion/react`) | `motion.div` + `AnimatePresence` | +42.5 kB (+27.4 kB with `LazyMotion`) | **Rejected.** CSS transitions and keyframes driven by motion tokens cover every transition in the spec, and collapse to ~0 under `prefers-reduced-motion`. |
| Floating UI (`@floating-ui/react`) | positioning + focus manager | +13.9 kB | **Rejected.** Only the account menu and sync panel need anchoring; both open from the top bar, so CSS positioning suffices. Revisit if a table cell ever needs a collision-aware popover. |
| React Aria | 4 hooks + `FocusScope` | +15.6 kB | **Rejected.** Best-in-class, but this app's few interactive patterns (menu, tabs, dialog, switch) are implemented to the WAI-ARIA patterns and verified by axe + keyboard tests. |
| **axe-core 4.13.0** (MPL-2.0) | dev-only | 0 kB shipped | **Installed (devDependency).** Injected by the CDP harness; gates the auth pages and the app shell. |
| **pixelmatch 7.2.0 + pngjs 7.0.0** (ISC/MIT) | dev-only | 0 kB shipped | **Installed (devDependency).** `supabase/tests/visual_diff.mjs` compares screenshot sets from two builds. |
| Playwright test runner | — | — | **Still deferred.** The CDP harness already does real devices, network conditions, crash tests, axe and screenshots. |
| Tailwind / shadcn/ui | — | — | **Still rejected.** The token CSS + primitives delivered the redesign without a styling migration; no evidence Tailwind would improve this codebase. |
| Web fonts (Sora, previously via Google Fonts `@import`) | — | — | **Removed.** Replaced by the system stack (Roboto on Android, SF on iOS): 0 bytes, works offline, no third-party request. |

`npm audit --omit=dev` after installation: 0 new advisories. The two pre-existing moderate
`react-router` advisories (open redirect through backslash paths in `<Link>`/`navigate`, SSR
hydration) are unchanged by this work. The login redirect now accepts only same-app paths, which
closes the reachable case; upgrading to react-router 7 is tracked as a separate task.
