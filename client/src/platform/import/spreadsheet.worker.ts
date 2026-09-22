// Parses an uploaded .xlsx inside a dedicated worker.
//
// Uses SheetJS 0.20.3 from the vendor CDN (pinned in package.json): npm's last
// xlsx release, 0.18.5, is permanently affected by prototype pollution
// (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9). The worker is kept as
// defence in depth: any prototype damage stays inside this throwaway realm and
// the caller terminates the worker on timeout, which bounds a ReDoS. Only plain
// string cells cross back to the app.
import * as XLSX from "xlsx";

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const MAX_COLUMNS = 64;

type Req = { buf: ArrayBuffer; maxRows: number };

self.onmessage = (ev: MessageEvent<Req>) => {
  try {
    const { buf, maxRows } = ev.data;
    const wb = XLSX.read(buf, {
      type: "array",
      sheetRows: maxRows + 1, // header row + data rows
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false
    });
    const first = wb.SheetNames[0];
    if (!first) throw new Error("Workbook has no sheets");
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first], { defval: "", raw: false });
    const rows = raw.map((r) => {
      const out: Record<string, string> = {};
      for (const k of Object.keys(r).slice(0, MAX_COLUMNS)) {
        const key = String(k).trim().slice(0, 64);
        if (!key || BLOCKED_KEYS.has(key)) continue;
        out[key] = String(r[k] ?? "").slice(0, 500);
      }
      return out;
    });
    (self as unknown as Worker).postMessage({ ok: true, rows });
  } catch (e) {
    (self as unknown as Worker).postMessage({ ok: false, error: e instanceof Error ? e.message : "Failed to parse workbook" });
  }
};
