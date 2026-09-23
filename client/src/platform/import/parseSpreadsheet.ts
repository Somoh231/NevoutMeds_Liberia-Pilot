import { normalizeHeader, type ImportRow } from "@/platform/import/rows";

export type { ImportRow };

// Input restrictions for pharmacy spreadsheet imports (CSV / XLSX).
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_COLUMNS = 64;
const PARSE_TIMEOUT_MS = 15000;
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function sanitizeRows(raw: Array<Record<string, unknown>>): ImportRow[] {
  return raw.slice(0, MAX_IMPORT_ROWS).map((r) => {
    const out: ImportRow = {};
    for (const k of Object.keys(r).slice(0, MAX_IMPORT_COLUMNS)) {
      // Headers are matched case-insensitively, with spaces as underscores ("Unit Cost" → unit_cost).
      const key = normalizeHeader(k);
      if (!key || BLOCKED_KEYS.has(key)) continue;
      out[key] = String(r[k] ?? "").slice(0, 500);
    }
    return out;
  });
}

function parseXlsxInWorker(buf: ArrayBuffer): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./spreadsheet.worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Spreadsheet took too long to read. Export it as CSV (UTF-8) and try again"));
    }, PARSE_TIMEOUT_MS);
    worker.onmessage = (ev: MessageEvent<{ ok: boolean; rows?: ImportRow[]; error?: string }>) => {
      clearTimeout(timer);
      worker.terminate();
      if (ev.data.ok) resolve(sanitizeRows(ev.data.rows ?? []));
      else reject(new Error(ev.data.error || "Failed to parse workbook"));
    };
    worker.onerror = (ev) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(ev.message || "Failed to parse workbook"));
    };
    worker.postMessage({ buf, maxRows: MAX_IMPORT_ROWS }, [buf]);
  });
}

export async function parseSpreadsheet(file: File): Promise<ImportRow[]> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`File is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB. Split it into smaller files`);
  }
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "xlsx") return parseXlsxInWorker(await file.arrayBuffer());

  if (ext === "csv") {
    const Papa = await import("papaparse");
    return new Promise((resolve, reject) => {
      Papa.default.parse<Record<string, unknown>>(file as any, {
        header: true,
        skipEmptyLines: true,
        preview: MAX_IMPORT_ROWS,
        complete: (res) => resolve(sanitizeRows((res.data as any[]) || [])),
        error: (error: Error) => reject(error)
      });
    });
  }

  throw new Error("Unsupported file type. Upload a .csv or .xlsx file (legacy .xls is not accepted)");
}
