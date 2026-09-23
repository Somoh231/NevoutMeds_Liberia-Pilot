import type { CurrencyCode } from "@/platform/country/types";

/**
 * Currency display rules.
 *
 * Ambiguity-safe symbols: "$" alone is never shown, because in Liberia it can
 * mean US or Liberian dollars. Amounts are stored as Postgres `numeric` and
 * are only rounded here, for display; the client never does authoritative
 * arithmetic on floats that is then written back.
 */
export type CurrencyInfo = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  /** Digits after the decimal point (ISO 4217 minor unit). */
  minorDigits: number;
  /** A space after the symbol ("KSh 1,200" but "₦1,200"). */
  spaced: boolean;
};

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: "USD", name: "US dollar", symbol: "US$", minorDigits: 2, spaced: false },
  LRD: { code: "LRD", name: "Liberian dollar", symbol: "L$", minorDigits: 2, spaced: false },
  SLE: { code: "SLE", name: "Sierra Leonean leone", symbol: "Le", minorDigits: 2, spaced: true },
  GHS: { code: "GHS", name: "Ghanaian cedi", symbol: "GH₵", minorDigits: 2, spaced: false },
  NGN: { code: "NGN", name: "Nigerian naira", symbol: "₦", minorDigits: 2, spaced: false },
  GMD: { code: "GMD", name: "Gambian dalasi", symbol: "D", minorDigits: 2, spaced: true },
  KES: { code: "KES", name: "Kenyan shilling", symbol: "KSh", minorDigits: 2, spaced: true },
  RWF: { code: "RWF", name: "Rwandan franc", symbol: "FRw", minorDigits: 0, spaced: true }
};

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === "string" && v in CURRENCIES;
}

export function getCurrency(code: string | null | undefined): CurrencyInfo | null {
  return isCurrencyCode(code) ? CURRENCIES[code] : null;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, digits: number): Intl.NumberFormat {
  const key = `${locale}|${digits}`;
  let f = numberFormats.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch {
      f = new Intl.NumberFormat("en", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    numberFormats.set(key, f);
  }
  return f;
}

export type MoneyFormatOptions = {
  locale?: string;
  /** Maximum fraction digits; never more than the currency has. */
  digits?: number;
  /** "US$1.2k" style, for tight spaces. */
  compact?: boolean;
  /** ISO code instead of a symbol ("12.50 USD"), e.g. for CSV exports. */
  codeOnly?: boolean;
};

/**
 * "US$12.50", "GH₵1,204.00", "KSh 350.00", "FRw 1,500".
 * An unknown currency code is shown as the code itself ("XOF 12.50") rather
 * than guessed.
 */
export function formatMoney(amount: number | string | null | undefined, currency: string, opts: MoneyFormatOptions = {}): string {
  const n = Number(amount ?? 0);
  const value = Number.isFinite(n) ? n : 0;
  const info = getCurrency(currency);
  const minor = info?.minorDigits ?? 2;
  const digits = Math.min(opts.digits ?? minor, minor);
  const locale = opts.locale ?? "en";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  let body: string;
  if (opts.compact && abs >= 1000) {
    const [div, suffix] = abs >= 1_000_000 ? [1_000_000, "M"] : [1000, "k"];
    body = numberFormat(locale, 1).format(abs / div) + suffix;
  } else {
    body = numberFormat(locale, digits).format(abs);
  }

  if (opts.codeOnly || !info) return `${sign}${body} ${info?.code ?? currency}`;
  return `${sign}${info.symbol}${info.spaced ? " " : ""}${body}`;
}

/**
 * Rounds a user-entered amount to the currency's minor unit (so an RWF price
 * is never sent with decimals, and USD never with more than 2). Returns a
 * string so the value travels to Postgres `numeric` without float noise.
 */
export function toMinorUnitString(amount: number | string, currency: string): string {
  const minor = getCurrency(currency)?.minorDigits ?? 2;
  const n = Number(amount);
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(minor);
}

/** Money input step for <input type="number">: "0.01" or "1". */
export function moneyInputStep(currency: string): string {
  const minor = getCurrency(currency)?.minorDigits ?? 2;
  return minor === 0 ? "1" : (1 / 10 ** minor).toFixed(minor);
}

/**
 * Two amounts can only be compared or added when they are in the same
 * currency. There is no FX table in NevOut Meds, so a mixed set is reported
 * as such instead of being converted.
 */
export function sameCurrency(codes: Array<string | null | undefined>): boolean {
  const set = new Set(codes.filter(Boolean));
  return set.size <= 1;
}

/** Sums amounts per currency: [{ currency, total, count }], never across currencies. */
export function totalsByCurrency<T>(rows: readonly T[], currencyOf: (r: T) => string, amountOf: (r: T) => number) {
  const map = new Map<string, { currency: string; total: number; count: number }>();
  for (const r of rows) {
    const c = currencyOf(r);
    const e = map.get(c) ?? { currency: c, total: 0, count: 0 };
    e.total += Number(amountOf(r)) || 0;
    e.count += 1;
    map.set(c, e);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
