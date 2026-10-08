// NevOut Meds — Privacy & Cookie Preferences in real Chrome (first-visit notice + preferences panel).
//
// Part A (signed out; no API needed): the notice appears on a first visit to the public site and
// never on sign-in screens; "Got it" dismisses it and the acknowledgment survives a reload; a new
// preference version shows it again; "Manage preferences" and the footer / Cookies page reopen the
// panel; the panel is a modal dialog (Esc, focus trap, focus restoration, keyboard only), offers no
// fake choices, and links to /privacy, /cookies and /terms. Layout at 320 / 360 / 390 / 768 / 1024 /
// laptop / desktop: inside the viewport, no sideways scroll, 44 px touch targets on phones, axe clean.
// No cookie, no third-party request or script, and no CSP violation at any point.
// Part B (signed in; PRIVACY_SIGNED_IN=1, needs the local stack + seed_e2e.sh): sign-in does not wait
// on the notice, the workspace never shows it, Help & feedback reopens the panel over itself and gets
// focus back, the panel shows no account or pharmacy data, and the session and offline storage are untouched.
//
// Usage: APP_BASE=http://127.0.0.1:5173 CHROME=… UDD=… OUT=… [PRIVACY_SIGNED_IN=1] node supabase/tests/ui_privacy_preferences.e2e.mjs
import { browser, reporter, sleep, BASE, IDS } from "./lib/harness.mjs";

const { check, done } = reporter();
const b = await browser({ port: 9494, out: process.env.OUT });
const KEY = "nevoutmeds_privacy_prefs";
const origin = new URL(BASE).origin;
const NOTICE = `document.querySelector('.nv-privacy-notice')`;
const DLG = `document.querySelector('dialog.nv-pp-dialog[open]')`;
const hasNotice = () => b.ev(`!!${NOTICE}`);
const dlgOpen = () => b.ev(`!!${DLG}`);
const active = () => b.ev(`(() => { const a = document.activeElement; return a ? (a.textContent || a.id || a.tagName).trim().slice(0, 60) : ''; })()`);
const record = async () => JSON.parse((await b.ev(`localStorage.getItem('${KEY}')`)) ?? "null");
const thirdParty = () => b.ev(`[...new Set(performance.getEntriesByType('resource').map(e => new URL(e.name).origin))].filter(o => o !== ${JSON.stringify(origin)})`);
const foreignScripts = () => b.ev(`[...document.scripts].map(s => s.src).filter(s => s && new URL(s).origin !== ${JSON.stringify(origin)})`);
const csp = () => b.ev(`(window.__csp || []).join(' | ')`);
const shiftTab = async () => {
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  await sleep(100);
};
// A real touch tap (phones emulate touch), not a mouse click.
const tap = async (box) => {
  if (!box) return false; const { x, y } = JSON.parse(box);
  await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(400); return true;
};
const clearPrefs = () => b.ev(`localStorage.removeItem('${KEY}'); 1`);
// The page's own CSP report: every violation on every document is collected.
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));" });

await b.reset();

// ── 1. First visit ─────────────────────────────────────────────────────────────
await b.viewport("laptop");
await b.go("/", 2500);
check("1 first visit to the home page shows the privacy notice", await hasNotice());
const notice = await b.ev(`(() => { const n = ${NOTICE}; return n ? { h: n.querySelector('h2')?.textContent, body: n.querySelector('p')?.textContent, btns: [...n.querySelectorAll('button')].map(x => x.textContent), links: [...n.querySelectorAll('a')].map(a => a.textContent + '=' + a.getAttribute('href')), label: document.getElementById(n.getAttribute('aria-labelledby'))?.textContent } : null; })()`);
check("notice: heading 'Privacy & site preferences' names the region", notice?.h === "Privacy & site preferences" && notice?.label === notice?.h, notice?.h);
check("notice: copy says essential storage only, no advertising trackers", /essential browser storage[\s\S]*secure, support sign-in, and enable offline\s+functionality\. We do not use advertising trackers\./.test(notice?.body ?? ""), notice?.body?.slice(0, 60));
check("notice: actions are 'Got it' and 'Manage preferences' only", JSON.stringify(notice?.btns) === JSON.stringify(["Got it", "Manage preferences"]), JSON.stringify(notice?.btns));
check("notice: links Privacy, Cookies, Terms", JSON.stringify(notice?.links) === JSON.stringify(["Privacy=/privacy", "Cookies=/cookies", "Terms=/terms"]), JSON.stringify(notice?.links));
check("no 'Accept all' / 'Reject all' / 'Deny' choices anywhere", !/accept all|reject all|\bdeny\b|accept cookies|reject cookies/i.test(await b.text()));
check("notice does not block the page (no modal open, page content rendered)", !(await b.ev(`!!document.querySelector('dialog[open]')`)) && !!(await b.ev(`document.querySelector('main h1')?.textContent`)));
check("notice does not steal focus", (await b.ev(`document.activeElement === document.body`)) === true);
check("17 no cookie is written before acknowledgment", (await b.ev("document.cookie")) === "");
check("nothing is stored before the visitor answers", (await record()) === null);
// Scoped to the notice: on main the home page's scroll story already fails contrast for its dimmed,
// inactive chapters (opacity 0.38), which is outside this component. The legal pages are scanned whole below.
const axeNotice = await b.axe([".nv-privacy-notice"]);
check("22 home page notice: no serious accessibility issues", axeNotice.serious.length === 0, axeNotice.text);
await b.shot("pp_notice__laptop");

// ── 11–13. Notice links work (and the notice stays until acknowledged) ───────────
for (const [route, h1] of [["/privacy", /Privacy Notice/], ["/cookies", /Cookies & Similar Technologies/], ["/terms", /Terms of Use/]]) {
  await b.click(`document.querySelector('.nv-privacy-notice a[href="${route}"]')`); await sleep(1800);
  const ok = (await b.ev("location.pathname")) === route && h1.test(await b.ev(`document.querySelector('h1')?.textContent ?? ''`));
  check(`${route === "/privacy" ? 11 : route === "/cookies" ? 12 : 13} notice '${route.slice(1)}' link opens ${route}`, ok, await b.ev("location.pathname"));
  check(`notice is still shown on ${route} until acknowledged`, await hasNotice());
  const ax = await b.axe();
  check(`22 ${route} with the notice: no serious accessibility issues`, ax.serious.length === 0, ax.text);
}

// ── 4, 8, 9, 10. Manage preferences → modal ───────────────────────────────────────
await b.go("/", 2500);
await b.clickText("^Manage preferences$", "document.querySelector('.nv-privacy-notice')"); await sleep(700);
check("4 'Manage preferences' opens the preferences dialog", await dlgOpen());
const dlg = await b.ev(`(() => { const d = ${DLG}; if (!d) return null; return {
  modal: d.matches(':modal'), title: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,
  desc: document.getElementById(d.getAttribute('aria-describedby'))?.textContent, text: d.innerText,
  inputs: d.querySelectorAll('input, select, [role=switch], [role=checkbox]').length,
  links: [...d.querySelectorAll('.nv-pp__links a')].map(a => a.textContent + '=' + a.getAttribute('href')),
  focusInside: d.contains(document.activeElement), w: d.getBoundingClientRect().width }; })()`);
check("dialog is modal with title 'Privacy & Cookie Preferences'", dlg?.modal === true && dlg?.title === "Privacy & Cookie Preferences", dlg?.title);
check("dialog intro: limited storage; no advertising or behavioral tracking", /limited browser storage[\s\S]*We currently do not use advertising or behavioral tracking technologies\./.test(dlg?.desc ?? ""));
check("Essential: 'Always active' and required for sign-in and security", /Essential\s*Always active\s*Required for secure sign-in, session handling, security controls, and core site functionality\./.test(dlg?.text ?? ""));
check("Offline functionality: explained, required for offline features", /Offline functionality\s*Required for offline features\s*Stores selected application information on this device/.test(dlg?.text ?? ""));
check("Optional analytics: 'Not currently used'", /Optional analytics\s*Not currently used\s*NevOut does not currently use optional analytics or behavioral tracking technologies\./.test(dlg?.text ?? ""));
check("Advertising & marketing: 'Not used'", /Advertising & marketing\s*Not used/.test(dlg?.text ?? ""));
check("no fake toggles: the dialog has no switches, checkboxes or inputs", dlg?.inputs === 0, String(dlg?.inputs));
check("no Accept all / Reject all in the dialog", !/accept all|reject all/i.test(dlg?.text ?? ""));
const foot = await b.ev(`[...${DLG}.querySelectorAll('.nv-dialog__foot button')].map(x => x.textContent).join(',')`);
check("the panel's only action is 'Done' (no Save, no second Close)", foot === "Done", foot);
check("'Save preferences' appears nowhere in the panel or page", !/save preferences/i.test(await b.text()));
check("the X close control is still there", (await b.ev(`!!${DLG}.querySelector('.nv-dialog__head button[aria-label="Close"]')`)) === true);
check("dialog links Privacy Notice, Cookies & Similar Technologies, Terms of Use", JSON.stringify(dlg?.links) === JSON.stringify(["Privacy Notice=/privacy", "Cookies & Similar Technologies=/cookies", "Terms of Use=/terms"]), JSON.stringify(dlg?.links));
check("dialog is 560–680 px wide on a laptop", dlg?.w >= 560 && dlg?.w <= 680, String(dlg?.w));
check("focus moves into the dialog", dlg?.focusInside === true);
const more = `document.querySelector('dialog[open] .nv-pp__more')`;
check("'Learn more' starts collapsed", (await b.ev(`${more}.getAttribute('aria-expanded')`)) === "false" && (await b.ev(`document.getElementById(${more}.getAttribute('aria-controls')).hidden`)) === true);
await b.click(more); await sleep(300);
const det = await b.ev(`document.getElementById(${more}.getAttribute('aria-controls'))?.innerText ?? ''`);
check("'Learn more' expands a short technical explanation", (await b.ev(`${more}.getAttribute('aria-expanded')`)) === "true" && /IndexedDB/.test(det) && /local storage/.test(det) && /service worker/.test(det), det.slice(0, 60));
const axeDlg = await b.axe();
check("22 dialog open: no serious accessibility issues", axeDlg.serious.length === 0, axeDlg.text);
await b.shot("pp_dialog__laptop");
let trapped = true;
for (let i = 0; i < 14; i++) { await b.press("Tab"); if (!(await b.ev(`${DLG}?.contains(document.activeElement)`))) trapped = false; }
for (let i = 0; i < 6; i++) { await shiftTab(); if (!(await b.ev(`${DLG}?.contains(document.activeElement)`))) trapped = false; }
check("9 focus is trapped in the dialog (Tab and Shift+Tab)", trapped);
await b.press("Escape"); await sleep(400);
check("8 Escape closes the dialog", !(await dlgOpen()));
check("10 focus returns to 'Manage preferences'", (await active()) === "Manage preferences", await active());
check("closing without saving keeps the notice (nothing recorded)", (await hasNotice()) && (await record()) === null);
await b.clickText("^Manage preferences$", "document.querySelector('.nv-privacy-notice')"); await sleep(600);
await b.click(`document.querySelector('dialog.nv-pp-dialog[open] .nv-dialog__head button[aria-label="Close"]')`); await sleep(400);
check("the X closes the dialog without recording anything", !(await dlgOpen()) && (await record()) === null && (await hasNotice()));
check("10 after the X, focus returns to 'Manage preferences'", (await active()) === "Manage preferences", await active());

// ── 2, 3. Got it, persistence, versioning ──────────────────────────────────────
await b.clickText("^Got it$", "document.querySelector('.nv-privacy-notice')"); await sleep(400);
check("2 'Got it' dismisses the notice", !(await hasNotice()));
const rec = await record();
check("acknowledgment is recorded: { version, acknowledged, optionalAnalytics, updatedAt } only", JSON.stringify(Object.keys(rec ?? {}).sort()) === JSON.stringify(["acknowledged", "optionalAnalytics", "updatedAt", "version"]) && rec.version === 1 && rec.acknowledged === true && rec.optionalAnalytics === false && !Number.isNaN(Date.parse(rec.updatedAt)), JSON.stringify(rec));
check("17 acknowledging writes no cookie", (await b.ev("document.cookie")) === "");
await b.go("/", 2200);
check("3 acknowledgment persists across reload", !(await hasNotice()));
await b.go("/terms", 1800);
check("3 …and across pages", !(await hasNotice()));
await b.ev(`localStorage.setItem('${KEY}', JSON.stringify({ version: 0, acknowledged: true, optionalAnalytics: false, updatedAt: new Date().toISOString() })); 1`);
await b.go("/", 2200);
check("an older preference version shows the notice again", await hasNotice());
await b.ev(`localStorage.setItem('${KEY}', '{not json'); 1`);
await b.go("/", 2200);
check("an unreadable record shows the notice again (no crash)", await hasNotice());

// ── Never on sign-in screens ──────────────────────────────────────────────────────
await clearPrefs();
for (const route of ["/login", "/forgot-password", "/accept-invite"]) {
  await b.go(route, 2000);
  check(`no notice on ${route}`, !(await hasNotice()));
}
await b.go("/login", 1800);
check("sign-in page legal links are unchanged (Privacy · Terms · Cookies, no extra entry)", (await b.ev(`[...document.querySelectorAll('.nv-legal-links a, .nv-legal-links button')].map(a => a.textContent).join(',')`)) === "Privacy,Terms,Cookies");

// ── 5. Reopen from the footers and the Cookies page ─────────────────────────────
await b.go("/", 2500);
await b.clickText("^Got it$", "document.querySelector('.nv-privacy-notice')"); await sleep(300);
const before = (await record())?.updatedAt;
const footBtn = `[...document.querySelectorAll('footer .nv-pp-link')].find(e => e.textContent === 'Privacy & Cookie Preferences')`;
check("home footer offers 'Privacy & Cookie Preferences'", !!(await b.ev(`!!${footBtn}`)));
check("home footer still links /cookies", (await b.ev(`!!document.querySelector('footer a[href="/cookies"]')`)) === true);
await b.click(footBtn); await sleep(600);
check("5 footer 'Privacy & Cookie Preferences' reopens the dialog", await dlgOpen());
await sleep(20);
await b.clickText("^Done$", `document.querySelector('dialog[open] .nv-dialog__foot')`); await sleep(500);
check("'Done' closes the dialog", !(await dlgOpen()));
check("'Done' updates the record", (await record())?.updatedAt !== before && (await record())?.acknowledged === true);
check("10 focus returns to the footer trigger", (await active()) === "Privacy & Cookie Preferences", await active());
await b.go("/cookies", 2000);
check("Cookies notice lists the preference record", /Privacy preferences \(browser local storage\)/.test(await b.text()));
await b.click(`document.querySelector('.nv-legal__doc .nv-pp-link')`); await sleep(600);
check("Cookies notice 'Your preferences' reopens the dialog", await dlgOpen());
await b.click(`document.querySelector('dialog[open] .nv-pp__links a[href="/privacy"]')`); await sleep(1500);
check("11 dialog 'Privacy Notice' opens /privacy and closes the dialog", (await b.ev("location.pathname")) === "/privacy" && !(await dlgOpen()));
await b.click(`document.querySelector('footer .nv-pp-link')`); await sleep(600);
check("legal-page footer reopens the dialog", await dlgOpen());
await b.click(`document.querySelector('dialog[open] .nv-pp__links a[href="/cookies"]')`); await sleep(1500);
check("12 dialog 'Cookies & Similar Technologies' opens /cookies", (await b.ev("location.pathname")) === "/cookies" && !(await dlgOpen()));
await b.click(`document.querySelector('footer .nv-pp-link')`); await sleep(600);
await b.click(`document.querySelector('dialog[open] .nv-pp__links a[href="/terms"]')`); await sleep(1500);
check("13 dialog 'Terms of Use' opens /terms", (await b.ev("location.pathname")) === "/terms" && !(await dlgOpen()));

// ── 20. Keyboard only ───────────────────────────────────────────────────────────
await clearPrefs();
await b.go("/", 2500);
let found = false;
for (let i = 0; i < 90 && !found; i++) { await b.press("Tab"); found = (await active()) === "Got it"; }
check("20 keyboard: the notice's 'Got it' is reachable by Tab", found);
await b.press("Tab");
check("20 keyboard: Tab moves to 'Manage preferences'", (await active()) === "Manage preferences", await active());
await b.press("Enter"); await sleep(600);
check("20 keyboard: Enter opens the dialog", await dlgOpen());
let doneKey = false;
for (let i = 0; i < 12 && !doneKey; i++) { await b.press("Tab"); doneKey = (await active()) === "Done"; }
check("20 keyboard: 'Done' is reachable by Tab", doneKey);
await b.press("Enter"); await sleep(600);
check("20 keyboard: Enter on 'Done' closes and records the acknowledgment", !(await dlgOpen()) && (await record())?.acknowledged === true && !(await hasNotice()));
check("20 keyboard: focus lands on the main content, not lost", (await b.ev(`document.activeElement?.id`)) === "main", await active());
await clearPrefs();
await b.go("/", 2500);
found = false;
for (let i = 0; i < 90 && !found; i++) { await b.press("Tab"); found = (await active()) === "Got it"; }
await b.press("Enter"); await sleep(400);
check("20 keyboard: Enter on 'Got it' dismisses and focus moves to the main content", !(await hasNotice()) && (await b.ev(`document.activeElement?.id`)) === "main");

// ── 19. Layout at every width ───────────────────────────────────────────────────────
for (const vp of ["320", "360", "390", "tablet", "1024", "laptop", "desktop"]) {
  await b.viewport(vp);
  await clearPrefs();
  await b.go("/", 2500);
  const box = await b.ev(`(() => { const r = ${NOTICE}?.getBoundingClientRect(); if (!r) return null; return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, vw: innerWidth, vh: innerHeight,
    btn: Math.min(...[...${NOTICE}.querySelectorAll('button')].map(x => x.getBoundingClientRect().height)) }; })()`);
  check(`19 ${vp}: notice fits inside the viewport`, !!box && box.l >= 0 && box.r <= box.vw && box.t >= 0 && box.b <= box.vh, JSON.stringify(box));
  check(`19 ${vp}: notice does not dominate the screen`, !!box && box.h <= box.vh * (box.vw < 400 ? 0.62 : 0.45), box && `${Math.round(box.h)}/${box.vh}`);
  check(`19 ${vp}: notice buttons are at least 44 px tall`, !!box && box.btn >= 44, box && String(box.btn));
  check(`19 ${vp}: no sideways scroll with the notice`, (await b.pan()) === 0, `${await b.pan()}px`);
  check(`19 ${vp}: no clipped text with the notice`, !(await b.clipped()), (await b.clipped()) || "none");
  await b.shot(`pp_notice__${vp}`);
  await b.clickText("^Manage preferences$", "document.querySelector('.nv-privacy-notice')"); await sleep(700);
  const d = await b.ev(`(() => { const d = ${DLG}; if (!d) return null; const r = d.getBoundingClientRect(); const f = d.querySelector('.nv-dialog__foot').getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, vw: innerWidth, vh: innerHeight, footB: f.bottom,
      btn: Math.min(...[...d.querySelectorAll('.nv-dialog__foot button, .nv-pp__more')].map(x => x.getBoundingClientRect().height)) }; })()`);
  check(`19 ${vp}: dialog fits inside the viewport`, !!d && d.l >= 0 && d.r <= d.vw + 0.5 && d.t >= 0 && d.b <= d.vh + 0.5, JSON.stringify(d));
  check(`19 ${vp}: dialog actions stay visible (sticky footer)`, !!d && d.footB <= d.vh + 0.5, d && `${d.footB}/${d.vh}`);
  check(`19 ${vp}: dialog width suits the screen`, !!d && (d.vw < 768 ? d.w >= d.vw - 1 : d.w >= 560 && d.w <= 680), d && String(d.w));
  if (d && d.vw < 768) check(`19 ${vp}: dialog actions are at least 44 px tall`, d.btn >= 44, String(d.btn));
  check(`19 ${vp}: no sideways scroll with the dialog`, (await b.pan()) === 0, `${await b.pan()}px`);
  check(`19 ${vp}: no clipped text in the dialog`, !(await b.clipped()), (await b.clipped()) || "none");
  const ax = await b.axe();
  check(`22 ${vp}: dialog has no serious accessibility issues`, ax.serious.length === 0, ax.text);
  await b.shot(`pp_dialog__${vp}`);
  if (d && d.vw < 768) {
    await tap(await b.rectOf(`[...document.querySelectorAll('dialog[open] .nv-dialog__foot button')].find(x => x.textContent === 'Done')`));
    check(`${vp}: touch tap on 'Done' closes the panel, records it and dismisses the notice`, !(await dlgOpen()) && (await record())?.acknowledged === true && !(await hasNotice()));
  } else {
    await b.press("Escape"); await sleep(300);
  }
}
await b.viewport("laptop");

// ── 14–17, 21. No trackers, no third parties, no cookies, no CSP violations ──────────────
check("14/15 no request to any third-party origin (no advertising or analytics trackers)", (await thirdParty()).length === 0, JSON.stringify(await thirdParty()));
check("16 no third-party script on the page", (await foreignScripts()).length === 0, JSON.stringify(await foreignScripts()));
check("16 no tracker globals (gtag, dataLayer, fbq, _hsq, mixpanel, posthog, clarity)", (await b.ev(`['gtag','dataLayer','fbq','_hsq','mixpanel','posthog','clarity','hj','analytics'].filter(k => k in window).join(',')`)) === "");
check("17 no cookies at the end of the signed-out run", (await b.ev("document.cookie")) === "");
check("21 no CSP violations (signed out)", (await csp()) === "", await csp());

// ── Part B: signed in ─────────────────────────────────────────────────────────────────
if (process.env.PRIVACY_SIGNED_IN === "1") {
  await b.reset();
  check("23 sign-in works without answering the notice (nothing waits on it)", (await b.signIn("ownerA@e2e.local")) === "/platform" && (await record()) === null);
  await sleep(1500);
  check("7 the workspace never shows the first-visit notice", !(await hasNotice()));
  const storage = await b.ev(`(async () => ({ session: Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)), dbs: ((await indexedDB.databases?.()) ?? []).map(d => d.name) }))()`);
  check("18 required storage works: sign-in session stored, offline database present", storage?.session === true && storage?.dbs?.length > 0, JSON.stringify(storage));
  await b.click(`document.querySelector('.nv-account-btn')`); await sleep(500);
  await b.clickText("^Help & feedback$"); await sleep(800);
  const helpBtn = `document.querySelector('dialog[open] .nv-legal-links .nv-pp-link')`;
  check("7 Help & feedback offers 'Privacy & Cookie Preferences'", (await b.ev(`${helpBtn}?.textContent`)) === "Privacy & Cookie Preferences");
  await b.click(helpBtn); await sleep(700);
  check("7 the preferences dialog opens signed in", await dlgOpen());
  const signedText = await b.ev(`${DLG}?.innerText ?? ''`);
  const who = await b.ev(`(() => { const k = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k)); const s = JSON.parse(localStorage.getItem(k) || '{}'); return { email: s.user?.email ?? '', id: s.user?.id ?? '' }; })()`);
  check("7 the dialog shows no account, pharmacy or customer data", !!who.email && !signedText.includes(who.email) && !signedText.includes(who.id) && !/Pharmacy A|e2e\.local/i.test(signedText));
  check("7 the dialog is only about browser storage (no consent, health or Business Performance)", !/consent|Business Performance|allerg|prescri/i.test(signedText));
  const axeIn = await b.axe();
  check("22 signed-in dialog: no serious accessibility issues", axeIn.serious.length === 0, axeIn.text);
  await b.shot("pp_dialog_signed_in__laptop");
  await b.press("Escape"); await sleep(400);
  check("8 Escape closes only the preferences dialog (Help stays open)", !(await dlgOpen()) && (await b.ev(`!!document.querySelector('dialog[open]')`)));
  check("10 focus returns to the Help dialog's preferences link", (await active()) === "Privacy & Cookie Preferences", await active());
  await b.click(helpBtn); await sleep(600);
  await b.clickText("^Done$", `document.querySelector('dialog.nv-pp-dialog[open] .nv-dialog__foot')`); await sleep(500);
  check("signed in: 'Done' closes the panel and Help stays open", !(await dlgOpen()) && (await b.ev(`!!document.querySelector('dialog[open]')`)));
  check("10 signed in: after 'Done', focus returns to the Help dialog's preferences link", (await active()) === "Privacy & Cookie Preferences", await active());
  const recIn = await b.ev(`localStorage.getItem('${KEY}')`);
  check("'Done' signed in records only the acknowledgment (no identity, account or pharmacy id)", !!recIn && !recIn.includes(who.email) && !recIn.includes(who.id) && !recIn.includes(IDS.pharmacyA ?? "@@none@@") && JSON.stringify(Object.keys(JSON.parse(recIn)).sort()) === JSON.stringify(["acknowledged", "optionalAnalytics", "updatedAt", "version"]), recIn);
  await b.press("Escape"); await sleep(400);
  const after = await b.ev(`(async () => ({ path: location.pathname, session: Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)), dbs: ((await indexedDB.databases?.()) ?? []).length }))()`);
  check("23 session and offline storage are unchanged after using the panel", after.path === "/platform" && after.session === true && after.dbs === storage.dbs.length, JSON.stringify(after));
  await b.go("/cookies", 2200);
  check("signed in: /cookies opens with 'Back to workspace' and no notice (already acknowledged)", (await b.ev(`!!document.querySelector('header a[href="/platform"]')`)) && !(await hasNotice()));
  await b.click(`document.querySelector('.nv-legal__doc .nv-pp-link')`); await sleep(600);
  check("signed in: the Cookies page reopens the dialog", await dlgOpen());
  await b.press("Escape"); await sleep(300);
  await b.click(`document.querySelector('header a[href="/platform"]')`); await sleep(2500);
  check("23 still signed in after visiting the public pages", (await b.ev("location.pathname")) === "/platform");
  check("17 signed-in run writes no cookies", (await b.ev("document.cookie")) === "");
  check("21 no CSP violations (signed in)", (await csp()) === "", await csp());
} else {
  console.log("# Part B (signed in) skipped: set PRIVACY_SIGNED_IN=1 with the local stack running");
}

check("no page exceptions", b.exceptions.length === 0, b.exceptions.slice(0, 2).join(" | "));
b.close();
process.exit(done("privacy-preference checks") ? 1 : 0);
