import { COUNTRY_PROFILES, getCountryConfig } from "@/platform/country/profiles";
import type { CountryCode } from "@/platform/country/types";

/**
 * Country-aware phone entry without a phone library.
 *
 * libphonenumber-js (min metadata) would add ~80 kB to the bundle for seven
 * countries; these rules (calling code, trunk prefix, national number length)
 * cover what the app needs: accept what people type ("0770123456",
 * "+231 77 012 3456", "231770123456"), store E.164, and display grouped.
 * They check shape, not whether a number is assigned to a network.
 */

export type PhoneCheck =
  | { ok: true; e164: string; country: CountryCode }
  | { ok: false; error: string };

const digitsOnly = (s: string) => s.replace(/\D+/g, "");

/** Country whose calling code starts a "+…" / "00…" international number. */
function countryForInternational(digits: string): CountryCode | null {
  for (const code of Object.keys(COUNTRY_PROFILES) as CountryCode[]) {
    if (digits.startsWith(COUNTRY_PROFILES[code].phone.callingCode)) return code;
  }
  return null;
}

/**
 * Validates and normalises a number typed by a user in `country`.
 * International numbers for another supported country are accepted as that
 * country (a customer may have a foreign SIM).
 */
export function parsePhone(input: string, country: string): PhoneCheck {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Enter a phone number." };
  const home = getCountryConfig(country);
  let digits = digitsOnly(raw);
  const international = raw.startsWith("+") || raw.startsWith("00");
  if (raw.startsWith("00")) digits = digits.slice(2);

  let target = home;
  let nsn: string;
  if (international) {
    const code = countryForInternational(digits);
    if (!code) return { ok: false, error: "That country code isn't supported yet." };
    target = COUNTRY_PROFILES[code];
    nsn = digits.slice(target.phone.callingCode.length);
  } else if (digits.startsWith(home.phone.callingCode) && digits.length > Math.max(...home.phone.nsnLengths)) {
    // "231770123456" typed without the plus.
    nsn = digits.slice(home.phone.callingCode.length);
  } else {
    nsn = digits;
  }
  // Drop the trunk prefix ("0770…" → "770…"), and a stray one after the code.
  if (target.phone.trunkPrefix && nsn.startsWith(target.phone.trunkPrefix) && !target.phone.nsnLengths.includes(nsn.length)) {
    nsn = nsn.slice(target.phone.trunkPrefix.length);
  }
  if (!target.phone.nsnLengths.includes(nsn.length)) {
    const lengths = target.phone.nsnLengths.join(" or ");
    return { ok: false, error: `A ${target.name} number has ${lengths} digits after +${target.phone.callingCode}. For example ${target.phone.example}.` };
  }
  return { ok: true, e164: `+${target.phone.callingCode}${nsn}`, country: target.code };
}

/** Groups a national number for display: "77 012 3456". */
function group(nsn: string, groups: readonly number[]): string {
  const out: string[] = [];
  let i = 0;
  const total = groups.reduce((a, b) => a + b, 0);
  // Shorter numbers drop digits from the first group.
  const g = [...groups];
  if (nsn.length < total) g[0] = Math.max(1, g[0] - (total - nsn.length));
  for (let k = 0; k < g.length && i < nsn.length; k++) {
    const size = k === g.length - 1 ? nsn.length - i : g[k];
    out.push(nsn.slice(i, i + size));
    i += size;
  }
  return out.join(" ");
}

/**
 * "+231 77 012 3456". Anything that doesn't parse (legacy free text) is shown
 * exactly as stored rather than altered.
 */
export function formatPhone(stored: string | null | undefined, country: string): string {
  if (!stored) return "";
  const p = parsePhone(stored, country);
  if (!p.ok) return stored;
  const profile = COUNTRY_PROFILES[p.country];
  const nsn = p.e164.slice(1 + profile.phone.callingCode.length);
  return `+${profile.phone.callingCode} ${group(nsn, profile.phone.groups)}`;
}

/** wa.me wants digits only, with the country code. */
export function whatsappDigits(stored: string | null | undefined, country: string): string | null {
  if (!stored) return null;
  const p = parsePhone(stored, country);
  return p.ok ? p.e164.slice(1) : digitsOnly(stored) || null;
}

export function phoneHint(country: string): string {
  const c = getCountryConfig(country);
  return `${c.name} numbers start +${c.phone.callingCode}. You can type it as ${c.phone.example}.`;
}
