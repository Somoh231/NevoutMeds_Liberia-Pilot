// NevOut Meds — Phase 11 premium pass: interaction checks for the new surfaces.
// Command search (keyboard + touch, offline, role-aware), fixed list columns,
// phone layouts that must not squeeze text. Synthetic data only; local stack.
//
// Usage: APP_BASE=<local build> NEVOUT_API_URL=<local> CHROME=<path> UDD=<dir> OUT=<dir> node supabase/tests/ui_premium.e2e.mjs
import { API, browser, reporter, sleep } from "./lib/harness.mjs";

if (API.includes("qohpyeqyveusnxhnbtxz")) { console.error("refusing to run against production"); process.exit(2); }
const { check, done } = reporter();
const b = await browser({ port: 9396, out: process.env.OUT });
const key = (k, mods = 0, code) => b.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: code ?? k, modifiers: mods, windowsVirtualKeyCode: { Escape: 27, Enter: 13, ArrowDown: 40, "/": 191, k: 75 }[k] ?? 0, ...(k.length === 1 && !mods ? { text: k } : {}) });
const up = (k, mods = 0, code) => b.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: code ?? k, modifiers: mods });

// ── Owner, laptop: keyboard ─────────────────────────────────────────────────
await b.viewport("laptop");
await b.reset();
check("owner signs in", (await b.signIn("ownerA@e2e.local")) === "/platform");
await b.ev(`document.body.focus(); 1`);
await key("k", 2, "KeyK"); await up("k", 2, "KeyK"); await sleep(700); // Ctrl+K
const opened = await b.ev(`!!document.querySelector('dialog.nv-cmd[open]')`);
check("Ctrl+K opens command search", opened);
check("the search input has focus and an accessible name", await b.ev(`document.activeElement?.classList.contains('nv-cmd__input') && !!document.activeElement.getAttribute('aria-label')`));
check("before typing it lists actions (New sale first)", /New sale/.test(await b.ev(`document.querySelector('.nv-cmd__item')?.textContent ?? ''`)));
await b.type("Para A"); await sleep(400);
const first = await b.ev(`document.querySelector('.nv-cmd__item[aria-selected="true"]')?.textContent ?? ''`);
check("typing finds a medicine from this device's list", /Para A/.test(first), first.slice(0, 60));
check("results are exposed as a listbox with an active option", await b.ev(`!!document.querySelector('[role=listbox] [role=option][aria-selected=true]') && !!document.querySelector('.nv-cmd__input').getAttribute('aria-activedescendant')`));
await key("Enter"); await up("Enter"); await sleep(1500);
check("Enter opens Inventory filtered to that medicine", /Inventory/.test(await b.ev(`document.querySelector('h1')?.textContent ?? ''`)) && (await b.ev(`document.querySelector('input[aria-label="Search products"]')?.value ?? ''`)) === "Para A");
check("the dialog closed after choosing", !(await b.ev(`!!document.querySelector('dialog.nv-cmd[open]')`)));
// "/" opens too; Esc closes
await b.ev(`document.activeElement?.blur(); 1`);
await key("/", 0, "Slash"); await up("/", 0, "Slash"); await sleep(600);
check('"/" opens command search when not typing', await b.ev(`!!document.querySelector('dialog.nv-cmd[open]')`));
await b.type("xyzzy"); await sleep(300);
check("no match explains what to try", /Nothing matches/.test(await b.ev(`document.querySelector('.nv-cmd__list')?.textContent ?? ''`)));
await key("Escape"); await up("Escape"); await sleep(400);
check("Esc closes it", !(await b.ev(`!!document.querySelector('dialog.nv-cmd[open]')`)));

// ── List columns line up (every row shares one grid) ────────────────────────
await b.open("inventory"); await sleep(1500);
const lefts = await b.ev(`JSON.stringify([...document.querySelectorAll('.nv-rows .nv-row')].slice(0, 12).map(r => Math.round(r.querySelectorAll('.nv-row__cell')[0]?.getBoundingClientRect().left ?? -1)))`);
check("Inventory: the Stock column starts at the same x on every row", new Set(JSON.parse(lefts)).size === 1, lefts);

// ── Phone: touch trigger, offline hint ──────────────────────────────────────
await b.viewport("360");
await b.go("/platform", 4000);
check("phone: a visible search button in the top bar", await b.ev(`(() => { const t = document.querySelector('.nv-cmd-trigger'); const r = t?.getBoundingClientRect(); return !!t && r.width >= 44 && r.height >= 44; })()`));
await b.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await b.ev(`window.dispatchEvent(new Event('offline')); 1`); await sleep(600);
await b.ev(`document.querySelector('.nv-cmd-trigger').click(); 1`); await sleep(700);
check("offline: search still opens and says it uses what this device saved", /Offline: searching what this device has saved/.test(await b.ev(`document.querySelector('dialog.nv-cmd')?.innerText ?? ''`)));
await b.type("Para"); await sleep(300);
check("offline: medicines are still found", /Para A/.test(await b.ev(`document.querySelector('.nv-cmd__list')?.innerText ?? ''`)));
check("phone: the panel fits the screen (no horizontal overflow)", await b.ev(`document.querySelector('.nv-cmd__panel').getBoundingClientRect().right <= innerWidth`));
await key("Escape"); await up("Escape"); await sleep(300);
await b.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await b.ev(`window.dispatchEvent(new Event('online')); 1`); await sleep(1500);

// ── Staff: owner-only screens never appear ──────────────────────────────────
await b.viewport("laptop");
await b.reset();
await b.signIn("staffA@e2e.local");
await b.ev(`document.querySelector('.nv-cmd-trigger').click(); 1`); await sleep(700);
const staffList = await b.ev(`document.querySelector('.nv-cmd__list')?.innerText ?? ''`);
check("staff: command search lists no owner-only screens", !/Financials|Reports|Staff\\n|Settings|Import data|Analyst/.test(staffList), staffList.replace(/\n/g, " | ").slice(0, 160));
await key("Escape"); await up("Escape");

check("no page exceptions", b.exceptions.length === 0, b.exceptions.slice(0, 2).join(" | "));
b.close();
process.exit(done("premium interaction checks") ? 1 : 0);
