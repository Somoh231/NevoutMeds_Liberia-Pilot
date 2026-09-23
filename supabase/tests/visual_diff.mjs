// NevOut Meds — visual regression diff (dev-only: pixelmatch + pngjs).
//
// Compares two folders of screenshots with the same file names (e.g. the
// $OUT/shots of ui_foundation.e2e.mjs run on a baseline build and on a
// candidate build), writes a red-overlay diff for each changed image, and
// fails when any image differs by more than MAX_DIFF_PCT (default 0.5 %).
//
// Usage: node supabase/tests/visual_diff.mjs <baselineDir> <candidateDir> <outDir>
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const [baseDir, candDir, outDir] = process.argv.slice(2);
if (!baseDir || !candDir || !outDir) {
  console.error("usage: visual_diff.mjs <baselineDir> <candidateDir> <outDir>");
  process.exit(2);
}
const MAX = Number(process.env.MAX_DIFF_PCT ?? 0.5);
fs.mkdirSync(outDir, { recursive: true });

let fail = 0, compared = 0;
for (const name of fs.readdirSync(baseDir).filter((f) => f.endsWith(".png")).sort()) {
  const candPath = path.join(candDir, name);
  if (!fs.existsSync(candPath)) { console.log(`MISSING ${name}`); fail++; continue; }
  const a = PNG.sync.read(fs.readFileSync(path.join(baseDir, name)));
  const b = PNG.sync.read(fs.readFileSync(candPath));
  compared++;
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`NOT OK ${name}: size ${a.width}×${a.height} → ${b.width}×${b.height}`);
    fail++;
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1, includeAA: false });
  const pct = (changed / (a.width * a.height)) * 100;
  const ok = pct <= MAX;
  if (!ok) { fail++; fs.writeFileSync(path.join(outDir, name.replace(/\.png$/, ".diff.png")), PNG.sync.write(diff)); }
  console.log(`${ok ? "ok  " : "NOT OK"} ${pct.toFixed(3).padStart(7)}%  ${name}`);
}
console.log(`\n# ${compared} screenshots compared, ${fail} over ${MAX}% (diffs in ${outDir})`);
process.exit(fail ? 1 : 0);
