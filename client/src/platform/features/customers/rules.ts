import { parsePhone } from "@/platform/country/phone";

/** Comparable form of a stored phone: E.164 when it parses, else the digits as typed. */
export function normalizePhone(raw: string, country = "LR") {
  const p = parsePhone(String(raw || ""), country);
  return p.ok ? p.e164 : String(raw || "").replace(/\s/g, "");
}

export function isDuplicatePhone(customers: Array<{ phone: string }>, phone: string, country = "LR") {
  const target = normalizePhone(phone, country);
  return customers.some((c) => normalizePhone(c.phone, country) === target);
}

/**
 * New customers are stored with an E.164 phone ("+231770123456") checked
 * against the pharmacy's country rules. Existing records are never rewritten.
 */
export function validateNewCustomer(input: { phone: string; firstName: string; lastName: string }, customers: Array<{ phone: string }>, country = "LR") {
  if (!String(input.phone || "").trim()) return { ok: false as const, phone: "", error: "Phone number required" };
  const parsed = parsePhone(input.phone, country);
  if (!parsed.ok) return { ok: false as const, phone: "", error: parsed.error };
  const phone = parsed.e164;
  if (isDuplicatePhone(customers, phone, country)) return { ok: false as const, phone, error: "Phone already registered" };
  if (!input.firstName || !input.lastName) return { ok: false as const, phone, error: "" };
  return { ok: true as const, phone, error: "" };
}
