/**
 * Country configuration types.
 *
 * The server (private.country_rules + the pharmacies trigger) is the authority
 * for what a country allows; these profiles mirror it so the app can render
 * and validate offline. Behaviour differs by *data*, never by
 * `if (country === ...)` branches in screens.
 */

export type CountryCode = "LR" | "SL" | "GH" | "NG" | "GM" | "KE" | "RW";
export type CurrencyCode = "USD" | "LRD" | "SLE" | "GHS" | "NGN" | "GMD" | "KES" | "RWF";

/** Stored payment method values. They are also the sale's `method` column. */
export type PaymentMethod = "Cash" | "Mobile Money" | "Credit" | "Diaspora Pay" | "Insurance" | "Card" | "Bank Transfer";

/**
 * How much we actually know. Nothing marked RESEARCH_REQUIRED is enforced,
 * pre-filled or presented as a legal requirement.
 */
export type Certainty = "KNOWN" | "RESEARCH_REQUIRED";

/** Stable keys: the storage key never changes when a country's label does. */
export type AddressFieldKey = "landmark" | "community" | "admin_area_2" | "admin_area_1";

export type AddressField = {
  key: AddressFieldKey;
  label: string;
  /** Existing column the value is stored in (customers table), if any. */
  column?: "landmark" | "community" | "county";
  /** Suggestions only (a datalist) — free text is always accepted. */
  options?: readonly string[];
  hint?: string;
};

export type RegulatoryField = {
  key: string;
  label: string;
  certainty: Certainty;
  /** Why it is here, or what research is needed before relying on it. */
  note: string;
};

export type PhoneRules = {
  callingCode: string;         // "231"
  nsnLengths: readonly number[]; // national significant number lengths
  trunkPrefix: string | null;  // "0" when locals dial 0 before the number
  groups: readonly number[];   // display grouping of the NSN (for the longest length)
  example: string;             // an obviously fictional example, in national format
};

export type CountryProfile = {
  code: CountryCode;
  name: string;
  flag: string;
  currencies: readonly CurrencyCode[];      // [0] is the default operating currency
  timezones: readonly string[];             // [0] is the default
  locales: readonly string[];               // [0] is the default
  paymentMethods: readonly PaymentMethod[]; // methods a pharmacy may enable
  defaultPaymentMethods: readonly PaymentMethod[];
  phone: PhoneRules;
  address: readonly AddressField[];
  regulatory: readonly RegulatoryField[];
  /** Sales tax / VAT handling. No rates are shipped until verified. */
  tax: { certainty: Certainty; note: string };
};

/** A pharmacy's resolved configuration (from its row + its country profile). */
export type TenantCountryConfig = {
  countryCode: CountryCode;
  currency: CurrencyCode;
  timezone: string;
  locale: string;
  paymentMethods: readonly PaymentMethod[];
  /** True once the pharmacy has recorded sales (server-reported). */
  countryLocked?: boolean;
};
