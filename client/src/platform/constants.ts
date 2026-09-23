// Legacy constants for screens that have not moved to design tokens yet.
// FONT and GREEN now resolve to the token system, so un-redesigned screens
// inherit the system font stack and the accessible brand colour.
// New code: import from "@/platform/design/tokens" instead.
export const FONT = "var(--nv-font)";

/** Brand action colour — white text on it is 6.50:1 (was #10b981: 2.54:1). Hex, not var(), because screens append alpha (`${GREEN}50`). */
export const GREEN = "#0b6b50";
export const DARK = "#0b1f17";
export const SLATE = "#12211b";
