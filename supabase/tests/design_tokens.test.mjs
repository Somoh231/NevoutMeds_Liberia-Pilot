// NevOut Meds — design token contrast test (no browser needed).
//
// Reads client/src/platform/design/tokens/tokens.css and checks every text /
// surface pairing the components actually use against WCAG 2.2 AA:
//   4.5:1 for text, 3:1 for large text and UI component boundaries (1.4.11).
// Change a colour token and this tells you immediately whether a pair broke.
//
// Usage: node supabase/tests/design_tokens.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, "../../client/src/platform/design/tokens/tokens.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const tokens = Object.fromEntries([...root.matchAll(/--nv-([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]));

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum, why]
const PAIRS = [
  ["text", "canvas", 4.5, "body text"],
  ["text", "surface", 4.5, "body text on cards"],
  ["text-secondary", "canvas", 4.5, "secondary text"],
  ["text-secondary", "surface-inset", 4.5, "secondary text in wells"],
  ["text-muted", "surface", 4.5, "muted text on cards"],
  ["text-muted", "canvas", 4.5, "muted text on the page"],
  ["text-muted", "surface-inset", 4.5, "muted text in wells"],
  ["text-on-brand", "brand", 4.5, "primary button label"],
  ["text-on-brand", "brand-hover", 4.5, "primary button label (hover)"],
  ["brand", "surface", 4.5, "links and brand text on cards"],
  ["brand", "canvas", 4.5, "links on the page"],
  ["brand", "brand-soft", 4.5, "selected nav item"],
  ["text-on-strong", "surface-strong", 4.5, "text on forest surfaces"],
  ["text-on-strong-secondary", "surface-strong", 4.5, "secondary text on forest"],
  ["text-on-strong-muted", "surface-strong", 4.5, "muted text on forest"],
  ["brand-glow-text", "surface-strong", 4.5, "accent text on forest"],
  ["success", "success-bg", 4.5, "success badge"],
  ["warning", "warning-bg", 4.5, "warning badge"],
  ["danger", "danger-bg", 4.5, "danger badge"],
  ["danger", "surface", 4.5, "field error text"],
  ["text-on-brand", "danger-solid", 4.5, "destructive button label"],
  ["info", "info-bg", 4.5, "info badge"],
  ["offline", "offline-bg", 4.5, "offline banner"],
  ["pending", "pending-bg", 4.5, "pending sync"],
  ["conflict", "conflict-bg", 4.5, "conflict banner"],
  ["border-strong", "surface", 3, "form control boundary (1.4.11)"],
  ["brand-glow", "surface-strong", 3, "decorative accent on forest (non-text)"]
];

let fail = 0;
for (const [fg, bg, min, why] of PAIRS) {
  if (!tokens[fg] || !tokens[bg]) { fail++; console.log(`NOT OK missing token --nv-${!tokens[fg] ? fg : bg}`); continue; }
  const r = ratio(tokens[fg], tokens[bg]);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "NOT OK"} ${r.toFixed(2).padStart(5)}:1 ≥ ${min}  --nv-${fg} on --nv-${bg}  (${why})`);
}
console.log(`\n# ${PAIRS.length} token contrast pairs, ${fail} failed`);
process.exit(fail ? 1 : 0);
