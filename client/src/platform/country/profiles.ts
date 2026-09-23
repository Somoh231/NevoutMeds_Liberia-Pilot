import type { AddressField, CountryCode, CountryProfile, RegulatoryField } from "@/platform/country/types";

/**
 * The seven supported country profiles. Data only — keep in step with
 * private.country_rules in supabase/migrations/0018_country_tenant_model.sql
 * (currencies, timezones, locales, payment methods). The server enforces
 * those; everything else here is presentation.
 *
 * Deliberately absent: tax rates, licence formats, regulator rules. See
 * docs/country/REGULATORY_RESEARCH_BACKLOG.md.
 */

const LR_COUNTIES = [
  "Bomi", "Bong", "Gbarpolu", "Grand Bassa", "Grand Cape Mount", "Grand Gedeh", "Grand Kru", "Lofa",
  "Margibi", "Maryland", "Montserrado", "Nimba", "River Cess", "River Gee", "Sinoe"
] as const;

const GH_REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern",
  "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North"
] as const;

const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
  "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers",
  "Sokoto", "Taraba", "Yobe", "Zamfara"
] as const;

const RW_PROVINCES = ["Kigali City", "Northern Province", "Southern Province", "Eastern Province", "Western Province"] as const;

/** Customer address, stored in the existing landmark / community / county columns. */
function address(community: string, adminArea1: string, options?: readonly string[], adminArea2?: string): AddressField[] {
  const fields: AddressField[] = [
    { key: "landmark", label: "Nearest landmark", column: "landmark", hint: "What someone would ask for to find the home." },
    { key: "community", label: community, column: "community" }
  ];
  if (adminArea2) fields.push({ key: "admin_area_2", label: adminArea2 });
  fields.push({ key: "admin_area_1", label: adminArea1, column: "county", options });
  return fields;
}

/** Identifiers owners may record for their own reference. Never validated or required. */
function regulatory(taxIdLabel: string, countryName: string): RegulatoryField[] {
  return [
    { key: "business_registration_no", label: "Business registration number", certainty: "KNOWN",
      note: "For your own records. NevOut Meds does not check it." },
    { key: "tax_id", label: taxIdLabel, certainty: "KNOWN",
      note: "For your own records. Its format is not validated and it is not printed on anything." },
    { key: "premises_licence_no", label: "Pharmacy premises licence number", certainty: "RESEARCH_REQUIRED",
      note: `The issuing authority, format and renewal rules for ${countryName} have not been verified.` },
    { key: "pharmacist_in_charge", label: "Pharmacist in charge", certainty: "RESEARCH_REQUIRED",
      note: `Whether ${countryName} requires a named pharmacist per premises has not been verified.` }
  ];
}

const TAX_UNVERIFIED = (country: string) => ({
  certainty: "RESEARCH_REQUIRED" as const,
  note: `How VAT or sales tax applies to medicines in ${country} has not been verified, so no tax is calculated or shown.`
});

const STANDARD_METHODS = ["Cash", "Mobile Money", "Credit", "Insurance", "Card", "Bank Transfer"] as const;

export const COUNTRY_PROFILES: Record<CountryCode, CountryProfile> = {
  LR: {
    code: "LR", name: "Liberia", flag: "🇱🇷",
    currencies: ["USD", "LRD"], timezones: ["Africa/Monrovia"], locales: ["en-LR"],
    // Display order matches the pre-Phase 9 till: Cash, Mobile Money, Credit, Insurance, Diaspora Pay.
    paymentMethods: ["Cash", "Mobile Money", "Credit", "Insurance", "Diaspora Pay", "Card", "Bank Transfer"],
    defaultPaymentMethods: ["Cash", "Mobile Money", "Credit", "Insurance", "Diaspora Pay"],
    phone: { callingCode: "231", nsnLengths: [7, 8, 9], trunkPrefix: "0", groups: [2, 3, 4], example: "077 012 3456" },
    address: address("Community", "County", LR_COUNTIES),
    regulatory: regulatory("Tax identification number (TIN)", "Liberia"),
    tax: TAX_UNVERIFIED("Liberia")
  },
  SL: {
    code: "SL", name: "Sierra Leone", flag: "🇸🇱",
    currencies: ["SLE"], timezones: ["Africa/Freetown"], locales: ["en-SL"],
    paymentMethods: STANDARD_METHODS, defaultPaymentMethods: ["Cash", "Mobile Money", "Credit"],
    phone: { callingCode: "232", nsnLengths: [8], trunkPrefix: "0", groups: [2, 6], example: "076 012345" },
    address: address("Community / area", "District"),
    regulatory: regulatory("Tax identification number (TIN)", "Sierra Leone"),
    tax: TAX_UNVERIFIED("Sierra Leone")
  },
  GH: {
    code: "GH", name: "Ghana", flag: "🇬🇭",
    currencies: ["GHS"], timezones: ["Africa/Accra"], locales: ["en-GH"],
    paymentMethods: STANDARD_METHODS, defaultPaymentMethods: ["Cash", "Mobile Money", "Credit"],
    phone: { callingCode: "233", nsnLengths: [9], trunkPrefix: "0", groups: [2, 3, 4], example: "024 012 3456" },
    address: address("Area / suburb", "Region", GH_REGIONS, "District"),
    regulatory: regulatory("Tax identification number (TIN)", "Ghana"),
    tax: TAX_UNVERIFIED("Ghana")
  },
  NG: {
    code: "NG", name: "Nigeria", flag: "🇳🇬",
    currencies: ["NGN"], timezones: ["Africa/Lagos"], locales: ["en-NG"],
    paymentMethods: STANDARD_METHODS, defaultPaymentMethods: ["Cash", "Credit", "Card", "Bank Transfer"],
    phone: { callingCode: "234", nsnLengths: [8, 10], trunkPrefix: "0", groups: [3, 3, 4], example: "0803 012 3456" },
    address: address("Area / neighbourhood", "State", NG_STATES, "LGA"),
    regulatory: regulatory("Tax identification number (TIN)", "Nigeria"),
    tax: TAX_UNVERIFIED("Nigeria")
  },
  GM: {
    code: "GM", name: "The Gambia", flag: "🇬🇲",
    currencies: ["GMD"], timezones: ["Africa/Banjul"], locales: ["en-GM"],
    paymentMethods: STANDARD_METHODS, defaultPaymentMethods: ["Cash", "Mobile Money", "Credit"],
    phone: { callingCode: "220", nsnLengths: [7], trunkPrefix: null, groups: [3, 4], example: "301 2345" },
    address: address("Community / area", "Region"),
    regulatory: regulatory("Tax identification number (TIN)", "The Gambia"),
    tax: TAX_UNVERIFIED("The Gambia")
  },
  KE: {
    code: "KE", name: "Kenya", flag: "🇰🇪",
    currencies: ["KES"], timezones: ["Africa/Nairobi"], locales: ["en-KE", "sw-KE"],
    paymentMethods: STANDARD_METHODS, defaultPaymentMethods: ["Cash", "Mobile Money", "Credit"],
    phone: { callingCode: "254", nsnLengths: [9], trunkPrefix: "0", groups: [3, 6], example: "0712 012345" },
    address: address("Estate / area", "County", undefined, "Sub-county"),
    regulatory: regulatory("KRA PIN", "Kenya"),
    tax: TAX_UNVERIFIED("Kenya")
  },
  RW: {
    code: "RW", name: "Rwanda", flag: "🇷🇼",
    currencies: ["RWF"], timezones: ["Africa/Kigali"], locales: ["en-RW", "fr-RW", "rw-RW"],
    paymentMethods: STANDARD_METHODS, defaultPaymentMethods: ["Cash", "Mobile Money", "Credit"],
    phone: { callingCode: "250", nsnLengths: [9], trunkPrefix: "0", groups: [3, 3, 3], example: "0788 012 345" },
    address: address("Sector / cell", "Province", RW_PROVINCES, "District"),
    regulatory: regulatory("Tax identification number (TIN)", "Rwanda"),
    tax: TAX_UNVERIFIED("Rwanda")
  }
};

export const COUNTRY_CODES = Object.keys(COUNTRY_PROFILES) as CountryCode[];

/** Every pharmacy created before Phase 9 is a Liberia pilot. */
export const DEFAULT_COUNTRY: CountryCode = "LR";

export function isCountryCode(v: unknown): v is CountryCode {
  return typeof v === "string" && v in COUNTRY_PROFILES;
}

export function getCountryConfig(code: string | null | undefined): CountryProfile {
  return COUNTRY_PROFILES[isCountryCode(code) ? code : DEFAULT_COUNTRY];
}
