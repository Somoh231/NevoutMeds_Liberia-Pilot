// NevOut Meds — before/after screenshot matrix for the premium pass (Phase 11).
// Same screens, same viewports, same synthetic showcase data every run, so two
// builds can be compared fairly (docs/ux/PREMIUM_REDESIGN_BEFORE_AFTER.md).
//
// Usage (LOCAL stack, after seed_e2e.sh + seed_showcase.mjs):
//   APP_BASE=http://127.0.0.1:4180 CHROME=<path> UDD=<dir> OUT=<dir> [EXTRA=1] node supabase/tests/premium_shots.mjs
// EXTRA=1 also captures the Phase 11 surfaces that do not exist before (command search).
import fs from "node:fs";
import path from "node:path";
import { browser, sleep } from "./lib/harness.mjs";

const OUT = process.env.OUT || "/tmp/nv-premium-shots";
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
const b = await browser({ port: 9395, out: OUT });
const VPS = (process.env.VPS || "360,430,laptop").split(",");
const APP_SCREENS = ["dashboard", "inventory", "sales", "customers", "suppliers", "expiry", "analytics", "reports", "financials"];

const fullShot = async (name, maxH = 2400) => {
  await b.ev(`(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); return 1; })()`); await sleep(250);
  const m = await b.send("Page.getLayoutMetrics");
  const h = Math.min(maxH, Math.ceil(m.result?.cssContentSize?.height ?? m.result?.contentSize?.height ?? 900));
  const w = Math.ceil(m.result?.cssLayoutViewport?.clientWidth ?? 1366);
  const r = await b.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  if (r.result?.data) fs.writeFileSync(path.join(OUT, "shots", `${name}.png`), Buffer.from(r.result.data, "base64"));
};

for (const vp of VPS) {
  await b.viewport(vp);
  await b.reset();
  await b.go("/", 3500); await fullShot(`${vp}__home`, vp === "laptop" ? 4200 : 5200);
  await b.go("/login", 2500); await b.shot(`${vp}__login`);
  await b.signIn("ownerA@e2e.local");
  for (const s of APP_SCREENS) {
    await b.open(s); await sleep(1500);
    await fullShot(`${vp}__${s}`);
    if (s === "sales") {
      // A sale in progress: customer chosen, two lines.
      await b.ev(`(() => { const i = document.querySelector('input[aria-label="Find customer"], input[placeholder="Name or phone"]'); return !!i; })()`);
      await b.click(`document.querySelector('input[placeholder="Name or phone"]')`); await b.type("Musu"); await sleep(400);
      await b.click(`document.querySelector('[aria-label="Matching customers"] button')`); await sleep(300);
      await b.click(`document.querySelector('input[placeholder="Search products"]')`); await b.type("Para"); await sleep(400);
      await b.click(`document.querySelector('[data-product-result]:not([disabled])')`); await sleep(300);
      await b.click(`document.querySelector('input[placeholder="Search products"]')`); await b.type("ORS"); await sleep(400);
      await b.click(`document.querySelector('[data-product-result]:not([disabled])')`); await sleep(500);
      await fullShot(`${vp}__sale-in-progress`);
    }
  }
  if (process.env.EXTRA) {
    await b.open("dashboard");
    await b.ev(`document.querySelector('.nv-cmd-trigger')?.click(); 1`); await sleep(700);
    await b.type("am"); await sleep(500);
    await b.shot(`${vp}__command-search`);
    await b.press("Escape"); await sleep(300);
  }
}
b.close();
console.log(`# premium shots → ${OUT}/shots`);
