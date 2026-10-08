// NevOut Meds — public legal pages in real Chrome (/privacy, /terms, /cookies).
//
// Part A (signed out; no API needed): pages load, read well at 360 px and laptop width,
// pass axe WCAG 2.2 AA (no serious/critical), have no horizontal scroll, keyboard works,
// no internal drafting markers are visible, the footer / sign-in page links work, no
// cookie is set, no consent banner is shown and no third-party request is made.
// Part B (signed in; LEGAL_SIGNED_IN=1, needs the local stack + seed_e2e.sh): the Help &
// feedback dialog links to the legal pages and the pages offer a way back to the workspace.
//
// Usage: APP_BASE=http://127.0.0.1:5173 CHROME=… UDD=… OUT=… [LEGAL_SIGNED_IN=1] node supabase/tests/ui_legal_pages.e2e.mjs
import { browser, reporter, sleep, BASE } from "./lib/harness.mjs";

const { check, done } = reporter();
const b = await browser({ port: 9492, out: process.env.OUT });
const PAGES = [
  ["/privacy", /Privacy Notice/],
  ["/terms", /Terms of Use/],
  ["/cookies", /Cookies & Similar Technologies/]
];
const MARKERS = /COUNSEL REVIEW|\[PLANNED|DRAFT|OWNER TO CONFIRM|PRIV-\d|CQ-\d|TO BE APPOINTED|RETENTION PERIOD TO BE|undefined|\[object Object\]/;
const origin = new URL(BASE).origin;
const thirdParty = () => b.ev(`[...new Set(performance.getEntriesByType('resource').map(e => new URL(e.name).origin))].filter(o => o !== ${JSON.stringify(origin)})`);

await b.reset();

// ── Part A: signed out ───────────────────────────────────────────────────────
for (const vp of ["360", "laptop"]) {
  await b.viewport(vp);
  for (const [route, title] of PAGES) {
    await b.go(route, 2200);
    const path = await b.ev("location.pathname");
    const h1 = await b.ev("document.querySelector('h1')?.textContent ?? ''");
    check(`${route} (${vp}) loads signed out`, path === route && title.test(h1), `${path} · ${h1}`);
    const body = await b.text();
    check(`${route} (${vp}) shows no internal drafting markers`, !MARKERS.test(body), (body.match(MARKERS) ?? [""])[0]);
    check(`${route} (${vp}) has no sideways scroll`, (await b.pan()) === 0, `${await b.pan()}px`);
    check(`${route} (${vp}) has no clipped text`, !(await b.clipped()), (await b.clipped()) || "none");
    const axe = await b.axe();
    check(`${route} (${vp}) has no serious accessibility issues`, axe.serious.length === 0, axe.text);
    check(`${route} (${vp}) header offers a visible way to sign in`, (await b.ev(`(() => { const a = document.querySelector('header a[href="/login"]'); return !!a && a.getBoundingClientRect().width > 0; })()`)) === true);
    check(`${route} (${vp}) sets no cookie`, (await b.ev("document.cookie")) === "");
    check(`${route} (${vp}) makes no third-party request`, (await thirdParty()).length === 0, JSON.stringify(await thirdParty()));
    check(`${route} (${vp}) shows no cookie / consent banner`, !(await b.ev(`!!document.querySelector('[class*=cookie i],[id*=cookie i],[class*=consent i],[id*=consent i]')`)) && !/accept (all )?cookies|cookie (settings|preferences)/i.test(body));
    await b.shot(`legal${route.replace("/", "_")}__${vp}`);
  }
}

await b.viewport("laptop");
await b.go("/privacy", 2200);
const bp = await b.ev(`document.querySelector('[data-testid="business-performance-notice"]')?.innerText ?? ''`);
check("privacy: Business Performance & Data Use notice is shown", /Business Performance & Data Use/.test(bp) && /not a credit score/.test(bp) && /does not make lending decisions/.test(bp), bp.slice(0, 80));
check("privacy: names privacy@nevoutmeds.com, never demo@", /privacy@nevoutmeds\.com/.test(await b.text()) && !/demo@nevoutmeds\.com/.test(await b.text()));
const tocOk = await b.ev(`[...document.querySelectorAll('.nv-legal__toc a')].every(a => document.getElementById(a.getAttribute('href').slice(1)))`);
check("privacy: every table-of-contents link has a target", tocOk === true);
check("privacy: Sign in link offered when signed out", (await b.ev(`!!document.querySelector('header a[href="/login"]')`)) === true);

// Keyboard: skip link first, then legal links reachable and operable
await b.go("/terms", 2000);
await b.press("Tab");
check("keyboard: first Tab focuses 'Skip to content'", /Skip to content/.test(await b.ev("document.activeElement?.textContent ?? ''")), await b.ev("document.activeElement?.textContent ?? ''"));
let reached = false;
for (let i = 0; i < 60 && !reached; i++) { await b.press("Tab"); reached = (await b.ev("document.activeElement?.getAttribute('href') ?? ''")) === "/cookies"; }
check("keyboard: footer 'Cookies' link is reachable by Tab", reached);
await b.press("Enter"); await sleep(1500);
check("keyboard: Enter on 'Cookies' opens /cookies", (await b.ev("location.pathname")) === "/cookies");

// Home footer and signed-out pages link to the legal pages
await b.go("/", 2500);
for (const [route] of PAGES) {
  const found = await b.ev(`!!document.querySelector('footer a[href="${route}"]')`);
  check(`home footer links ${route}`, found === true);
}
await b.click(`document.querySelector('footer a[href="/terms"]')`); await sleep(1500);
check("home footer 'Terms' opens /terms", (await b.ev("location.pathname")) === "/terms");
await b.go("/login", 2200);
const loginLinks = await b.ev(`[...document.querySelectorAll('.nv-legal-links a')].map(a => a.textContent + '=' + a.getAttribute('href')).join(',')`);
check("sign-in page shows Privacy · Terms · Cookies", loginLinks === "Privacy=/privacy,Terms=/terms,Cookies=/cookies", loginLinks);
await b.click(`document.querySelector('.nv-legal-links a[href="/privacy"]')`); await sleep(1500);
check("sign-in page 'Privacy' opens /privacy", (await b.ev("location.pathname")) === "/privacy");
await b.go("/login", 2000);
check("sign-in form is unchanged (email + password only)", (await b.ev("document.querySelectorAll('main input').length")) === 2);
const loginAxe = await b.axe();
check("sign-in page still has no serious accessibility issues", loginAxe.serious.length === 0, loginAxe.text);
await b.go("/accept-invite", 2000);
check("invitation page shows the legal links", (await b.ev(`document.querySelectorAll('.nv-legal-links a').length`)) === 3);
await b.shot("legal_login_footer__laptop");

// ── Part B: signed in ────────────────────────────────────────────────────────
if (process.env.LEGAL_SIGNED_IN === "1") {
  await b.reset();
  check("signed in as an owner (with two-step verification)", (await b.signIn("ownerA@e2e.local")) === "/platform");
  await sleep(2500);
  await b.click(`document.querySelector('.nv-account-btn')`); await sleep(500);
  await b.clickText("^Help & feedback$"); await sleep(800);
  const dlg = await b.ev(`[...document.querySelectorAll('dialog[open] .nv-legal-links a')].map(a => a.getAttribute('href')).join(',')`);
  check("Help & feedback shows Privacy · Terms · Cookies", dlg === "/privacy,/terms,/cookies", dlg);
  await b.shot("legal_help_dialog__laptop");
  await b.click(`document.querySelector('dialog[open] .nv-legal-links a[href="/privacy"]')`); await sleep(1800);
  check("Help 'Privacy' opens /privacy and closes the dialog", (await b.ev("location.pathname")) === "/privacy" && !(await b.ev(`!!document.querySelector('dialog[open]')`)));
  check("signed in: legal page offers 'Back to workspace'", (await b.ev(`!!document.querySelector('header a[href="/platform"]')`)) === true);
  await b.click(`document.querySelector('header a[href="/platform"]')`); await sleep(2500);
  check("'Back to workspace' returns to /platform still signed in", (await b.ev("location.pathname")) === "/platform");
} else {
  console.log("# Part B (signed in) skipped: set LEGAL_SIGNED_IN=1 with the local stack running");
}

check("no page exceptions", b.exceptions.length === 0, b.exceptions.slice(0, 2).join(" | "));
b.close();
process.exit(done("legal-page checks") ? 1 : 0);
