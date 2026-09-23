# Tokens

Canonical source: `client/src/platform/design/tokens/tokens.css`. Typed references for inline styles:
`client/src/platform/design/tokens/index.ts` (e.g. `color.textMuted` → `"var(--nv-text-muted)"`).
Contrast is verified by `node supabase/tests/design_tokens.test.mjs` (27 pairs, all pass).

## Colour

The palette comes from the official mark: a deep forest field with a luminous green capsule. The
old brand green `#10b981` gave white text only **2.54:1**. Rather than darkening everything, the
system splits the role in two:

* **`--nv-brand` `#0B6B50`** (deep jade) for actions and brand text on light surfaces: **6.50:1**
  with white, 5.97:1 as text on the canvas.
* **`--nv-brand-glow` `#4ADE80`** (the logo's luminous green) is used only on the forest surface and
  for decoration: 9.86:1 there.

### Surfaces

| Token | Value | Use |
|---|---|---|
| `--nv-canvas` | `#F3F6F4` | app background (slightly green-grey, so white cards read as raised) |
| `--nv-surface` | `#FFFFFF` | cards, sidebar, inputs |
| `--nv-surface-elevated` | `#FFFFFF` | dialogs and menus (depth tokens carry the difference) |
| `--nv-surface-inset` | `#EEF2F0` | wells, tab tracks, table headers |
| `--nv-surface-strong` | `#0B1F17` | forest ink: auth stage, hero surfaces, avatar |
| `--nv-surface-strong-2` | `#12301F` | a layered plane on top of strong |

### Text (measured contrast)

| Token | Value | On canvas | On surface | On inset |
|---|---|---|---|---|
| `--nv-text` | `#12211B` | 15.33 | 16.68 | — |
| `--nv-text-secondary` | `#3D5048` | 7.91 | 8.61 | 7.62 |
| `--nv-text-muted` | `#5A6B64` | 5.19 | 5.64 | 5.00 |
| `--nv-text-on-strong` / `-secondary` / `-muted` | `#E8F1EC` / `#B7C6BF` / `#9FB5AB` | on strong: 14.91 / 9.69 / 7.91 | | |

`--nv-text-muted` is the lightest text colour allowed anywhere; the old `#94A3B8` (2.56:1) is gone
from every screen.

### Lines

| Token | Value | Note |
|---|---|---|
| `--nv-border` | `#DDE5E1` | decorative card edges |
| `--nv-border-strong` | `#7F8F88` | form control boundaries: 3.39:1 (WCAG 1.4.11) |
| `--nv-divider` | `#E8EDEA` | separators |

### Brand and status

| Token | Text / tint / edge | Text on tint |
|---|---|---|
| brand | `#0B6B50` / `#E4F3EC` / `#B9DDCC` | 5.67 |
| success | `#14683F` / `#E6F4EC` / `#B5DCC6` | 6.01 |
| warning | `#8A4B00` / `#FFF3E0` / `#F3CF98` | 6.20 |
| danger | `#B42318` / `#FDECEA` / `#F4B8B1` (solid: white 6.57) | 5.75 |
| info | `#1D4ED8` / `#EAF1FF` / `#B9CCF5` | 5.91 |
| **offline** | `#3B3F8F` / `#ECEDFB` / `#C3C6EF` | 7.88 |
| **pending** | `#1D4ED8` / `#EAF1FF` / `#B9CCF5` | 5.91 |
| **conflict** | `#A3123A` / `#FCE8EE` / `#F1B3C5` | 6.62 |

Offline, pending and conflict are first-class tones, distinct from warning and danger, because
they describe the device's relationship with the server, not a problem with the data. Offline is
indigo on purpose: noticeable, but not alarming.

## Depth: a restrained spatial system

Light comes from above. Each step adds a longer, softer shadow and a top inner highlight, so
planes read as physically stacked, not as floating glass. There is no blur on surfaces (the only
blur is the translucent top bar and bottom bar), no neon, and no large dramatic shadows.

| Token | Composition | Used for |
|---|---|---|
| `--nv-depth-0` | none | page, inset wells |
| `--nv-depth-1` | inset top highlight + 1 px contact shadow | cards, sidebar items, inputs |
| `--nv-depth-2` | + 4–12 px ambient | elevated cards, metric cards, selected tab, auth card on desktop |
| `--nv-depth-3` | + 12–28 px ambient | menus, sync panel, hovered interactive cards, auth card on phone |
| `--nv-depth-4` | ring + 28–64 px ambient | dialogs, sheets, toasts |
| `--nv-plane-light` | white → `#FBFCFB` | top-light on raised planes |
| `--nv-plane-strong` | radial glow + forest gradient | hero and brand surfaces |

Interaction: `--nv-lift` (`translateY(-1px)`) on hover for primary buttons and interactive cards,
pressed buttons sink 1 px, the selected tab rises out of its inset track, and dialogs enter with a
4° perspective settle. ActionCard allows at most 2.5° of pointer tilt, only for a fine pointer and
never under reduced motion.

## Typography

System stack: `system-ui, -apple-system, "Segoe UI", Roboto, …`. That is Roboto on Android and SF on
iOS: 0 bytes, available offline, and no third-party request. Figures use tabular numerals (`.nv-num`,
metric and table tokens) so columns of money and stock align.

| Token | Size / line / weight | Use |
|---|---|---|
| `--nv-text-display` | 32 / 1.1 / 700, −0.025em | auth headline, hero |
| `--nv-text-h1` | 24 / 1.2 / 700 | page title |
| `--nv-text-h2` | 20 / 1.3 / 700 | dialog title, section |
| `--nv-text-h3` | 17 / 1.35 / 650 | card title |
| `--nv-text-section` | 14 / 1.4 / 650 | group headings |
| `--nv-text-body` | 15 / 1.55 / 400 | body |
| `--nv-text-body-sm` | 14 / 1.5 | secondary body |
| `--nv-text-caption` | 13 / 1.4 / 500 | labels, hints (**12 px is the floor**) |
| `--nv-text-metric` | 28 / 1.1 / 700 tabular | financial and stock figures |
| `--nv-text-table` | 15 / 1.4 / 500 tabular | table values |

Inputs use 16 px on touch devices, so iOS never zooms the page on focus.

## Space, radius, controls, shell

* Space: 4 px base: `--nv-space-1…16` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
* Page padding 16 → 24 (≥768) → 32 (≥1200); panel padding 16 → 20 → 24; grid gap 12 → 16 → 20.
* Radius: xs 6, sm 8, md 12, lg 16, xl 22, pill.
* Controls: 44 px high on touch; 40 px with a fine pointer.
* Shell: top bar 56/64, bottom bar 64 + safe area, rail 88, sidebar 256; `env(safe-area-inset-*)`
  applied to the top bar, bottom bar, sheets and toasts.

## Motion

| Token | Value |
|---|---|
| `--nv-dur-fast` / `-base` / `-slow` | 120 / 180 / 260 ms |
| `--nv-ease-out` | `cubic-bezier(.2,.8,.2,1)` for entrances |
| `--nv-ease-in-out` | `cubic-bezier(.4,0,.2,1)` |
| `--nv-ease-spring` | `cubic-bezier(.34,1.3,.64,1)`, for small pops only (switch thumb, tab icon) |

`prefers-reduced-motion: reduce` sets every duration to 0.01 ms and `--nv-lift` to none, and stops
the shimmer, spinner and pulse. The legacy screen animations are also neutralised
(verified in `ui_foundation.e2e.mjs`).
