import type { CustomerRow, PurchaseRow, UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export type UiPurchase = {
  date: string;
  items: string;
  amount: number;
  method: string;
  staffId?: string | number;
};

export type UiCustomer = {
  id: string | number;
  phone: string;
  firstName: string;
  lastName: string;
  dob?: string;
  gender?: string;
  community: string;
  landmark?: string;
  county?: string;
  altPhone?: string;
  altName?: string;
  registeredAt?: string;
  totalSpend: number;
  visitCount: number;
  lastVisit: string;
  creditBalance: number;
  creditLimit: number;
  conditions: string[];
  allergies: string[];
  notes?: string;
  reminders: any[];
  purchases: UiPurchase[];
};

function asDateString(dt: string | null | undefined) {
  if (!dt) return "";
  return String(dt).split("T")[0];
}

export async function fetchCustomers(args: { pharmacyId: UUID }): Promise<UiCustomer[]> {
  const db = getSupabaseDb();
  const { pharmacyId } = args;

  const { data: custRows, error } = await db
    .from("customers")
    .select("*")
    .eq("pharmacy_id", pharmacyId)
    .order("last_visit", { ascending: false })
    .limit(500);
  if (error) throw error;

  const customers = (custRows ?? []) as unknown as CustomerRow[];
  const customerIds = customers.map((c) => c.id);

  const purchasesByCustomer: Record<string, UiPurchase[]> = {};
  if (customerIds.length > 0) {
    const { data: purRows, error: pErr } = await db
      .from("purchases")
      .select("*")
      .eq("pharmacy_id", pharmacyId)
      .in("customer_id", customerIds)
      .order("purchased_at", { ascending: false })
      .limit(1500);
    if (pErr) throw pErr;
    const purchases = (purRows ?? []) as unknown as PurchaseRow[];
    for (const p of purchases) {
      const key = p.customer_id;
      if (!purchasesByCustomer[key]) purchasesByCustomer[key] = [];
      if (purchasesByCustomer[key].length >= 3) continue;
      purchasesByCustomer[key].push({
        date: asDateString(p.purchased_at),
        items: p.items_text,
        amount: p.amount,
        method: p.method,
        staffId: p.staff_id ?? undefined
      });
    }
  }

  return customers.map((c) => ({
    id: c.id,
    phone: c.phone,
    firstName: c.first_name,
    lastName: c.last_name,
    dob: c.dob ?? undefined,
    gender: c.gender ?? undefined,
    community: c.community ?? "",
    landmark: c.landmark ?? undefined,
    county: c.county ?? undefined,
    altPhone: c.alt_phone ?? undefined,
    altName: c.alt_name ?? undefined,
    registeredAt: c.registered_at,
    totalSpend: c.total_spend,
    visitCount: c.visit_count,
    lastVisit: c.last_visit,
    creditBalance: c.credit_balance,
    creditLimit: c.credit_limit,
    conditions: c.conditions ?? [],
    allergies: c.allergies ?? [],
    notes: c.notes ?? undefined,
    reminders: [],
    purchases: purchasesByCustomer[c.id] ?? []
  }));
}

