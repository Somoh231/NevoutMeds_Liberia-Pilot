import { formatMoney, isCurrencyCode, totalsByCurrency, type MoneyFormatOptions } from "@/platform/country/currency";
import { businessToday, formatDate, formatDateTime, type DateStyle } from "@/platform/country/datetime";
import { COUNTRY_PROFILES, getCountryConfig, isCountryCode } from "@/platform/country/profiles";
import type { PaymentMethod, TenantCountryConfig } from "@/platform/country/types";

/**
 * The signed-in pharmacy's resolved country configuration.
 *
 * Held once per session (set by CountryProvider from the pharmacies row, or
 * the offline profile snapshot) so the ~60 money call sites don't each need
 * the tenant passed in. Every value is validated against the country profile;
 * anything unknown falls back to that country's default rather than a guess.
 */

export type ResolvedTenantConfig = TenantCountryConfig & {
  /** True when read from a server that has the Phase 9 columns. */
  confirmed: boolean;
};

const LR = COUNTRY_PROFILES.LR;

/** How every pharmacy behaved before Phase 9 (and still does in Liberia). */
export const LIBERIA_DEFAULT: ResolvedTenantConfig = {
  countryCode: "LR",
  currency: "USD",
  timezone: LR.timezones[0],
  locale: LR.locales[0],
  paymentMethods: LR.defaultPaymentMethods,
  confirmed: false
};

type PharmacyRowLike = {
  country_code?: string | null;
  default_currency?: string | null;
  timezone?: string | null;
  locale?: string | null;
  payment_methods?: string[] | null;
};

export function resolveTenantConfig(row: PharmacyRowLike | null | undefined, extra: { countryLocked?: boolean } = {}): ResolvedTenantConfig {
  if (!row || !isCountryCode(row.country_code)) return LIBERIA_DEFAULT;
  const p = getCountryConfig(row.country_code);
  const currency = isCurrencyCode(row.default_currency) && p.currencies.includes(row.default_currency) ? row.default_currency : p.currencies[0];
  const methods = (row.payment_methods ?? []).filter((m): m is PaymentMethod => (p.paymentMethods as readonly string[]).includes(m));
  return {
    countryCode: p.code,
    currency,
    timezone: row.timezone && p.timezones.includes(row.timezone) ? row.timezone : p.timezones[0],
    locale: row.locale && p.locales.includes(row.locale) ? row.locale : p.locales[0],
    paymentMethods: methods.length ? methods : p.defaultPaymentMethods,
    countryLocked: extra.countryLocked,
    confirmed: true
  };
}

let active: ResolvedTenantConfig = LIBERIA_DEFAULT;

export function setActiveTenantConfig(c: ResolvedTenantConfig | null | undefined) {
  active = c ?? LIBERIA_DEFAULT;
}

export function getActiveTenantConfig(): ResolvedTenantConfig {
  return active;
}

/** Money in the pharmacy's operating currency: "US$12.50", "GH₵12.50". */
export function money(amount: number | string | null | undefined, opts: MoneyFormatOptions = {}) {
  return formatMoney(amount, active.currency, { locale: active.locale, ...opts });
}

/** Money in an explicit currency (supplier prices, orders, historical rows). */
export function moneyIn(amount: number | string | null | undefined, currency: string | null | undefined, opts: MoneyFormatOptions = {}) {
  return formatMoney(amount, currency || active.currency, { locale: active.locale, ...opts });
}

/**
 * A total over rows that may carry different currencies: "US$120.00" or
 * "US$120.00 + L$4,000.00" — summed per currency, never converted.
 */
export function moneyTotals<T>(rows: readonly T[], currencyOf: (r: T) => string | null | undefined, amountOf: (r: T) => number) {
  const totals = totalsByCurrency(rows, (r) => currencyOf(r) || active.currency, amountOf);
  return totals.length ? totals.map((t) => moneyIn(t.total, t.currency)).join(" + ") : money(0);
}

/** The pharmacy's business date, "YYYY-MM-DD", in its own timezone. */
export function tenantToday(now?: Date) {
  return businessToday(active.timezone, now);
}

export function tenantDate(value: string | Date | null | undefined, style?: DateStyle) {
  return formatDate(value, { locale: active.locale, timeZone: active.timezone, style });
}

export function tenantDateTime(value: string | Date | null | undefined) {
  return formatDateTime(value, { locale: active.locale, timeZone: active.timezone });
}
