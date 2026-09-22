// Headless Chromium + raw CDP: visit SPA routes, capture console errors, verify SW registration.
import { spawn } from "node:child_process";
const BIN = process.env.CHROME;
const BASE = process.env.BASE || "http://127.0.0.1:4173";
const port = 9333;
const proc = spawn(BIN, [`--remote-debugging-port=${port}`, "--no-first-run", `--user-data-dir=${process.env.UDD}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver; for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await sleep(200); } }
const page = ver.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable"); await send("Page.enable");
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const results = [];
for (const route of ["/", "/login", "/platform", "/onboarding", "/import", "/admin", "/nope/deep/link"]) {
  events.length = 0;
  await send("Page.navigate", { url: BASE + route });
  await sleep(3500);
  const info = await evaluate(`(async()=>{const reg=await navigator.serviceWorker.getRegistration();return {final:location.pathname,title:document.title,rootChildren:document.getElementById('root')?.children.length||0,text:document.body.innerText.slice(0,90).replace(/\\n/g,' | '),sw:reg?(reg.active?.state||reg.installing?.state||reg.waiting?.state):null,controlled:!!navigator.serviceWorker.controller,caches:(await caches.keys()).join(',')}})()`);
  const errors = events.filter((e) => (e.method === "Runtime.exceptionThrown") || (e.method === "Log.entryAdded" && e.params.entry.level === "error") || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")).map((e) => e.params.exceptionDetails?.exception?.description || e.params.entry?.text || e.params.args?.map((a) => a.value).join(" "));
  const failed = events.filter((e) => e.method === "Network.responseReceived" && e.params.response.status >= 400).map((e) => `${e.params.response.status} ${e.params.response.url}`);
  const loadFailed = events.filter((e) => e.method === "Network.loadingFailed").map((e) => e.params.errorText);
  results.push({ route, ...info, errors, failed, loadFailed });
}
console.log(JSON.stringify(results, null, 1));
ws.close(); proc.kill();
