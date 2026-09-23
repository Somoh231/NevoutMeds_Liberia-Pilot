/**
 * Typed references to the CSS custom properties in tokens.css.
 *
 * Use these in inline styles instead of hex values, e.g.
 *   style={{ color: color.textMuted, boxShadow: depth[2] }}
 * The value is always the `var(--nv-…)` reference, so the CSS file stays the
 * single source of truth and themes can change without touching components.
 */
const v = (name: string) => `var(--nv-${name})`;

export const color = {
  canvas: v("canvas"),
  surface: v("surface"),
  surfaceElevated: v("surface-elevated"),
  surfaceInset: v("surface-inset"),
  surfaceStrong: v("surface-strong"),
  text: v("text"),
  textSecondary: v("text-secondary"),
  textMuted: v("text-muted"),
  textOnBrand: v("text-on-brand"),
  textOnStrong: v("text-on-strong"),
  textOnStrongSecondary: v("text-on-strong-secondary"),
  border: v("border"),
  borderStrong: v("border-strong"),
  divider: v("divider"),
  brand: v("brand"),
  brandHover: v("brand-hover"),
  brandSoft: v("brand-soft"),
  brandGlow: v("brand-glow"),
  success: v("success"),
  successBg: v("success-bg"),
  warning: v("warning"),
  warningBg: v("warning-bg"),
  danger: v("danger"),
  dangerBg: v("danger-bg"),
  info: v("info"),
  infoBg: v("info-bg"),
  offline: v("offline"),
  offlineBg: v("offline-bg"),
  pending: v("pending"),
  pendingBg: v("pending-bg"),
  conflict: v("conflict"),
  conflictBg: v("conflict-bg")
} as const;

export const depth = {
  0: v("depth-0"),
  1: v("depth-1"),
  2: v("depth-2"),
  3: v("depth-3"),
  4: v("depth-4")
} as const;

export const font = {
  family: v("font"),
  mono: v("font-mono"),
  display: v("text-display"),
  h1: v("text-h1"),
  h2: v("text-h2"),
  h3: v("text-h3"),
  section: v("text-section"),
  body: v("text-body"),
  bodySm: v("text-body-sm"),
  caption: v("text-caption"),
  metric: v("text-metric"),
  table: v("text-table")
} as const;

export const space = {
  1: v("space-1"), 2: v("space-2"), 3: v("space-3"), 4: v("space-4"), 5: v("space-5"),
  6: v("space-6"), 8: v("space-8"), 10: v("space-10"), 12: v("space-12"), 16: v("space-16"),
  page: v("page-pad"),
  panel: v("panel-pad"),
  gap: v("grid-gap")
} as const;

export const radius = {
  xs: v("radius-xs"), sm: v("radius-sm"), md: v("radius-md"), lg: v("radius-lg"), xl: v("radius-xl"), pill: v("radius-pill")
} as const;

export const motion = {
  fast: v("dur-fast"), base: v("dur-base"), slow: v("dur-slow"),
  easeOut: v("ease-out"), easeInOut: v("ease-in-out"), spring: v("ease-spring")
} as const;

/** Semantic tones shared by Badge, Alert, StatusBadge and sync UI. */
export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "offline" | "pending" | "conflict";

/** Layout breakpoints (px). Phone < tablet ≤ … < desktop. */
export const breakpoints = { tablet: 768, desktop: 1200 } as const;
