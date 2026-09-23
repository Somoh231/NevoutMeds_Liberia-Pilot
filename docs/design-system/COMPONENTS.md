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
| `PageHeader` | — | the screen's single `<h1>`, description, actions |
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
