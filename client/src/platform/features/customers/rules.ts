export function normalizePhone(raw: string) {
  return String(raw || "").replace(/\s/g, "");
}

export function isDuplicatePhone(customers: Array<{ phone: string }>, phone: string) {
  const target = normalizePhone(phone);
  return customers.some((c) => normalizePhone(c.phone) === target);
}

export function validateNewCustomer(input: { phone: string; firstName: string; lastName: string }, customers: Array<{ phone: string }>) {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false as const, phone, error: "Phone number required" };
  if (isDuplicatePhone(customers, phone)) return { ok: false as const, phone, error: "Phone already registered" };
  if (!input.firstName || !input.lastName) return { ok: false as const, phone, error: "" };
  return { ok: true as const, phone, error: "" };
}

