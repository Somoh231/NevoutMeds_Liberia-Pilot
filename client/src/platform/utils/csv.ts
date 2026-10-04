/**
 * The one CSV encoder for every export.
 *
 * Product, customer, supplier and document names are typed by any team member,
 * and the files are opened by owners in Excel or Google Sheets. A cell that
 * starts with = + - @ (or a tab / carriage return) is run as a formula there,
 * so such text is prefixed with an apostrophe and shown as plain text
 * (OWASP "CSV injection"). Plain numbers, including negative ones, are kept as
 * numbers. Every cell is quoted and inner quotes are doubled, so a value can
 * never break out of its cell.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (typeof value !== "number" && FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
