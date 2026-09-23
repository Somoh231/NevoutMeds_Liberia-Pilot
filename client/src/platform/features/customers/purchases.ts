import { tenantToday } from "@/platform/country/tenant";

export function calcPurchaseAmount(med: { sellingPrice: number }, qty: number) {
  return med.sellingPrice * qty;
}

export function buildPurchaseItemString(medName: string, qty: number) {
  return `${medName} x${qty}`;
}

/** The pharmacy's business date (its own timezone), as the server records last_visit. */
export function todayISO() {
  return tenantToday();
}

export function applyPurchaseToCustomer(
  customer: any,
  purchase: {
    items: string;
    amount: number;
    method: string;
    staffId: number;
    date?: string;
  }
) {
  const date = purchase.date ?? todayISO();
  return {
    ...customer,
    totalSpend: customer.totalSpend + purchase.amount,
    visitCount: customer.visitCount + 1,
    lastVisit: date,
    creditBalance: purchase.method === "Credit" ? customer.creditBalance + purchase.amount : customer.creditBalance,
    purchases: [{ date, items: purchase.items, amount: purchase.amount, method: purchase.method, staffId: purchase.staffId }, ...customer.purchases]
  };
}

export function buildNewCustomerRecord(customers: any[], form: any, normalizedPhone: string) {
  const newId = Math.max(...customers.map((c: any) => c.id)) + 1;
  const date = todayISO();
  return {
    id: newId,
    phone: normalizedPhone,
    firstName: form.firstName,
    lastName: form.lastName,
    dob: form.dob,
    gender: form.gender,
    community: form.community,
    landmark: form.landmark,
    county: form.county,
    altPhone: form.altPhone,
    altName: form.altName,
    registeredAt: date,
    totalSpend: 0,
    visitCount: 0,
    lastVisit: date,
    creditBalance: 0,
    creditLimit: 30,
    conditions: form.conditions ? form.conditions.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
    allergies: form.allergies ? form.allergies.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
    notes: form.notes,
    reminders: [],
    purchases: []
  };
}

