# NevOut Meds design system

The foundation every screen is built on. Made for pharmacy counters on low-end Android phones over
intermittent 3G, and still premium on a laptop.

| Layer | Where | Doc |
|---|---|---|
| Tokens: colour, depth, type, space, radius, motion | `client/src/platform/design/tokens/` (`tokens.css` is canonical; `index.ts` gives typed `var()` references) | [TOKENS.md](TOKENS.md) |
| Primitives: controls, surfaces, feedback, overlays, sync status | `client/src/platform/ui/` (`ui.css` + components, one entry point `@/platform/ui`) | [COMPONENTS.md](COMPONENTS.md) |
| App shell and navigation | `client/src/platform/shell/` (`AppShell`, `navigation.ts`, `useLayout`, `Brand`) | [../ux/UX_DECISIONS.md](../ux/UX_DECISIONS.md) |
| Auth presentation | `client/src/platform/auth/AuthLayout.tsx`, `authMessages.ts` | [../ux/UX_DECISIONS.md](../ux/UX_DECISIONS.md) |

## Principles

1. **Calm operations, dimensional decisions.** Tables, lists and forms stay flat and quiet
   (depth 0–1). Depth 2–4, lift and the small pointer tilt are reserved for key actions, hero
   surfaces, overlays and the auth stage.
2. **Honest states.** Loading is never shown as empty; work saved only on this device is never
   called "saved"; offline and conflict states are visible on every screen (banner + pill).
3. **Accessible by construction.** Every colour pair used for text meets WCAG 2.2 AA, verified by a
   test. Focus is always visible, icon-only controls require a label, and forms are real `<form>`s.
   Dialogs trap focus and return it.
4. **Zero-cost where possible.** System fonts, CSS variables, native `<dialog>`, and one small icon
   library (named imports). The initial download went **down** during the redesign.
5. **One way to do each thing.** New code imports from `@/platform/ui` and
   `@/platform/design/tokens`, never hex values or ad-hoc components.

## Using it

```tsx
import { Button, FormField, Input, Alert, Dialog, PageHeader } from "@/platform/ui";
import { color, depth, space } from "@/platform/design/tokens";

<PageHeader title="Inventory" description="2 products · 0 need attention" actions={<Button variant="primary">Add product</Button>} />
<FormField label="Email" required error={errors.email}>
  <Input type="email" value={email} onChange={…} />
</FormField>
```

## Verification

| Check | Command |
|---|---|
| Token contrast (27 pairs) | `node supabase/tests/design_tokens.test.mjs` |
| Foundation gate (layout, axe, keyboard, navigation, states, invite) | `supabase/tests/ui_foundation.e2e.mjs` |
| Measured UX audit (107 page × viewport combinations) | `supabase/tests/ux_audit.mjs` |
| Visual regression between two builds | `supabase/tests/visual_diff.mjs <baseline> <candidate> <out>` |

## Migration status

Screens that have not been redesigned yet run inside the new shell through a small, explicit
legacy layer (`.nv-screen`, the legacy section at the end of `ui.css`, and the legacy `Modal`,
`Field`, `Input` and `Toast` in `platform/components/primitives.tsx`, now built on the new
primitives). Each screen's redesign removes its reliance on that layer.

## Phase 11: premium second pass

The system now names **surface roles** (canvas → surface → raised → decision → critical),
**figure typography** (tabular, tight, units muted) and **motion semantics**
(enter, exit, expand, select, hover, press, success, sync). See [TOKENS.md](TOKENS.md) and the
new patterns in [COMPONENTS.md](COMPONENTS.md).

**Rule of thumb:**
- dimensional treatment is reserved for the one decision on a screen;
- dense operational lists stay flat;
- motion is used only to explain a change of state.

**Rejected on measurement:**

| Option | Measured cost | Reason |
|---|---|---|
| WebGL (React Three Fiber) | 233 kB gzip | Too heavy |
| ShaderGradient | 277 kB gzip | Too heavy |
| Motion (`motion/react`) | 43 kB gzip | CSS and native Web Animations cover it at 0 kB |
| liquid-glass-react | — | Needs React 19 |

The audit, before/after matrix and report are in `docs/ux/PREMIUM_SECOND_PASS_AUDIT.md`,
`docs/ux/PREMIUM_REDESIGN_BEFORE_AFTER.md` and `PREMIUM_UI_UX_UPGRADE_REPORT.md`.
