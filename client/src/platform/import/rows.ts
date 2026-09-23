import { parsePhone } from "@/platform/country/phone";

/**
 * Row validation for spreadsheet imports.
 *
 * Opening data is what a pharmacy will trust from day one, so a value that
 * can't be read exactly is rejected with a reason and a spreadsheet row
 * number. It is never guessed or turned into 0 (a price of "$5.00" or a blank
 * stock cell must not become 0).
 * Row numbers count the header as row 1, as a spreadsheet shows them.
 */

export type ImportRow = Record<string, string>;
export type Problem = { row: number; reason: string };

/** "Unit Cost", "unit-cost", " UNIT_COST " → "unit_cost". */
export function normalizeHeader(key: string): string {
  return String(key).trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_").slice(0, 64);
}

const cell = (r: ImportRow, key: string) => String(r[key] ?? "").trim();

type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Plain numbers, optionally with thousands separators: "12", "12.50", "1,200", "1,200.5". */
function parseNumber(raw: string, column: string): Parsed<number> {
  const plain = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, "") : raw;
  if (!/^-?\d+(\.\d+)?$/.test(plain)) return { ok: false, reason: `${column} must be a number without currency symbols (got "${raw.slice(0, 20)}")` };
  const n = Number(plain);
  if (n < 0) return { ok: false, reason: `${column} cannot be negative` };
  return { ok: true, value: n };
}

function amount(r: ImportRow, column: string, required: boolean): Parsed<number> {
  const raw = cell(r, column);
  if (!raw) return required ? { ok: false, reason: `missing ${column}` } : { ok: true, value: 0 };
  return parseNumber(raw, column);
}

function wholeNumber(r: ImportRow, column: string, required: boolean): Parsed<number> {
  const p = amount(r, column, required);
  if (p.ok && !Number.isInteger(p.value)) return { ok: false, reason: `${column} must be a whole number` };
  return p;
}

/** YYYY-MM-DD and a real calendar date. Day/month order is never guessed. */
function isoDate(r: ImportRow, column: string): Parsed<string | null> {
  const raw = cell(r, column);
  if (!raw) return { ok: true, value: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    return { ok: false, reason: `${column} must be a date written YYYY-MM-DD, e.g. 2027-03-31 (got "${raw.slice(0, 20)}")` };
  }
  return { ok: true, value: raw };
}

/** Collects the first failure of several parses; returns null when all passed. */
function firstFailure(...parsed: Array<Parsed<unknown>>): string | null {
  for (const p of parsed) if (!p.ok) return p.reason;
  return null;
}

/** Rejects later rows that repeat a key already seen in this file. */
function dedupe<T>(items: Array<{ row: number; key: string; value: T }>, label: string, problems: Problem[]) {
  const seen = new Map<string, number>();
  const kept: Array<{ row: number; value: T }> = [];
  for (const it of items) {
    const first = seen.get(it.key);
    if (first !== undefined) { problems.push({ row: it.row, reason: `same ${label} as row ${first}` }); continue; }
    seen.set(it.key, it.row);
    kept.push({ row: it.row, value: it.value });
  }
  return kept;
}

export function buildProducts(rows: ImportRow[], pharmacyId: string) {
  const problems: Problem[] = [];
  const items: Array<{ row: number; key: string; value: Record<string, unknown> }> = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    const name = cell(r, "name");
    const category = cell(r, "category");
    const missing = [!name && "name", !category && "category"].filter(Boolean);
    if (missing.length) return void problems.push({ row, reason: `missing ${missing.join(", ")}` });
    const unitCost = amount(r, "unit_cost", true);
    const price = amount(r, "selling_price", true);
    const reorder = wholeNumber(r, "reorder_point", false);
    const max = wholeNumber(r, "max_stock", false);
    const velocity = amount(r, "daily_velocity", false);
    const bad = firstFailure(unitCost, price, reorder, max, velocity);
    if (bad) return void problems.push({ row, reason: bad });
    items.push({
      row,
      key: name.toLowerCase(),
      value: {
        pharmacy_id: pharmacyId,
        name,
        brand: cell(r, "brand") || null,
        category,
        unit: cell(r, "unit") || null,
        unit_cost: (unitCost as { value: number }).value,
        selling_price: (price as { value: number }).value,
        reorder_point: (reorder as { value: number }).value,
        max_stock: (max as { value: number }).value,
        daily_velocity: (velocity as { value: number }).value
      }
    });
  });
  const kept = dedupe(items, "product name", problems);
  return { payload: kept.map((k) => k.value), problems };
}

export function buildCustomers(rows: ImportRow[], pharmacyId: string, country: string) {
  const problems: Problem[] = [];
  const items: Array<{ row: number; key: string; value: Record<string, unknown> }> = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    const phoneRaw = cell(r, "phone");
    const first = cell(r, "first_name");
    const last = cell(r, "last_name");
    const missing = [!phoneRaw && "phone", !first && "first_name", !last && "last_name"].filter(Boolean);
    if (missing.length) return void problems.push({ row, reason: `missing ${missing.join(", ")}` });
    const phone = parsePhone(phoneRaw, country);
    if (!phone.ok) return void problems.push({ row, reason: `phone "${phoneRaw.slice(0, 20)}": ${phone.error}` });
    const credit = amount(r, "credit_limit", false);
    if (!credit.ok) return void problems.push({ row, reason: credit.reason });
    items.push({
      row,
      key: phone.e164,
      value: {
        pharmacy_id: pharmacyId,
        phone: phone.e164,
        first_name: first,
        last_name: last,
        community: cell(r, "community") || null,
        county: cell(r, "county") || null,
        landmark: cell(r, "landmark") || null,
        credit_limit: credit.value
      }
    });
  });
  const kept = dedupe(items, "phone number", problems);
  return { payload: kept.map((k) => k.value), problems };
}

/** Inventory rows plus the spreadsheet row of each, to map server-side errors back. */
export function buildInventory(rows: ImportRow[]) {
  const problems: Problem[] = [];
  const items: Array<{ row: number; key: string; value: Record<string, string> }> = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    const productName = cell(r, "product_name");
    if (!productName) return void problems.push({ row, reason: "missing product_name" });
    const stock = wholeNumber(r, "stock", true);
    const expiry = isoDate(r, "expiry_date");
    const bad = firstFailure(stock, expiry);
    if (bad) return void problems.push({ row, reason: bad });
    items.push({
      row,
      key: productName.toLowerCase(),
      value: {
        product_name: productName,
        stock: String((stock as { value: number }).value),
        batch_id: cell(r, "batch_id"),
        expiry_date: (expiry as { value: string | null }).value ?? ""
      }
    });
  });
  const kept = dedupe(items, "product_name", problems);
  return { payload: kept.map((k) => k.value), lines: kept.map((k) => k.row), problems };
}

/** "missing phone (rows 3, 7); …", grouped by reason, longest lists truncated. */
export function describeProblems(problems: Problem[]): string {
  const grouped = new Map<string, number[]>();
  for (const p of [...problems].sort((a, b) => a.row - b.row)) {
    const list = grouped.get(p.reason) ?? [];
    list.push(p.row);
    grouped.set(p.reason, list);
  }
  return [...grouped.entries()]
    .map(([reason, lines]) => `${reason} (row${lines.length === 1 ? "" : "s"} ${lines.slice(0, 8).join(", ")}${lines.length > 8 ? `, +${lines.length - 8} more` : ""})`)
    .join("; ");
}
