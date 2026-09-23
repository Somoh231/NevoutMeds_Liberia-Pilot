import { getCountryConfig } from "@/platform/country/profiles";
import type { AddressField, CurrencyCode, PaymentMethod, RegulatoryField } from "@/platform/country/types";

/**
 * Per-country form fields, resolved from profile data.
 * Screens render whatever these return; none of them branch on a country code.
 */

/** Address fields. `forCustomers` keeps only the ones with a storage column. */
export function getAddressFields(country: string, opts: { forCustomers?: boolean } = {}): AddressField[] {
  const fields = [...getCountryConfig(country).address];
  return opts.forCustomers ? fields.filter((f) => f.column) : fields;
}

/** The label a country uses for a stable address key ("County", "Region"…). */
export function addressLabel(country: string, key: AddressField["key"]): string {
  return getCountryConfig(country).address.find((f) => f.key === key)?.label ?? key;
}

/**
 * Payment methods offered at the till: the pharmacy's own choice, else its
 * country's defaults. The server re-checks the method on every sale.
 */
export function getPaymentMethods(config: { countryCode: string; paymentMethods?: readonly string[] | null } | null | undefined): PaymentMethod[] {
  const profile = getCountryConfig(config?.countryCode);
  const chosen: readonly string[] = config?.paymentMethods?.length ? config.paymentMethods : profile.defaultPaymentMethods;
  // Profile order (stable at the till); never offers something the country
  // doesn't allow, whatever was cached.
  return profile.paymentMethods.filter((m) => chosen.includes(m));
}

/** Methods an owner may switch on in Settings. */
export function getAvailablePaymentMethods(country: string): PaymentMethod[] {
  return [...getCountryConfig(country).paymentMethods];
}

const METHOD_HINTS: Partial<Record<PaymentMethod, string>> = {
  Credit: "Added to the customer's balance",
  "Diaspora Pay": "Paid by family abroad",
  Insurance: "Recorded only — no claim is sent",
  "Bank Transfer": "Confirm the transfer before recording"
};
export function paymentMethodHint(m: PaymentMethod): string | undefined {
  return METHOD_HINTS[m];
}

/**
 * Currencies a supplier price or purchase order may be recorded in: the
 * country's own plus USD (mirrors private.allowed_trade_currencies).
 */
export function getTradeCurrencies(country: string): CurrencyCode[] {
  const own = getCountryConfig(country).currencies;
  return own.includes("USD") ? [...own] : [...own, "USD"];
}

/** Regulatory identifiers, each marked KNOWN or RESEARCH_REQUIRED. */
export function getRegulatoryFields(country: string): RegulatoryField[] {
  return [...getCountryConfig(country).regulatory];
}

export function getTaxPolicy(country: string) {
  return getCountryConfig(country).tax;
}
