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
