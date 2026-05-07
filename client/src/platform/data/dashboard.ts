import type { UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export type DashboardKpis = {
  lowStockCount: number;
  expiringSoonCount: number;
  totalCustomers: number;
  outstandingCredit: number;
  revenueLast30Days: number;
  recentSales: Array<{ id: string; date: string; amount: number; method: string; items: string }>;
  fastMoving: Array<{ id: string; name: string; dailyVelocity: number }>;
};

function isoDate(d: Date) {
  return d.toISOString();
}

export async function fetchDashboardKpis(args: { pharmacyId: UUID }): Promise<DashboardKpis> {
  const db = getSupabaseDb();
  const { pharmacyId } = args;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [custAgg, recentSalesRes, fastMovingRes, invRes, expiringRes, revenueRes] = await Promise.all([
    db.from("customers").select("id,credit_balance").eq("pharmacy_id", pharmacyId).limit(2000),
    db.from("purchases").select("id,purchased_at,amount,method,items_text").eq("pharmacy_id", pharmacyId).order("purchased_at", { ascending: false }).limit(8),
    db.from("products").select("id,name,daily_velocity").eq("pharmacy_id", pharmacyId).order("daily_velocity", { ascending: false }).limit(5),
    db.from("inventory").select("product_id,stock").eq("pharmacy_id", pharmacyId),
    db.from("inventory").select("product_id,expiry_date").eq("pharmacy_id", pharmacyId).not("expiry_date", "is", null),
    db.from("purchases").select("amount,purchased_at").eq("pharmacy_id", pharmacyId).gte("purchased_at", isoDate(since))
  ]);

  if (custAgg.error) throw custAgg.error;
  if (recentSalesRes.error) throw recentSalesRes.error;
  if (fastMovingRes.error) throw fastMovingRes.error;
  if (invRes.error) throw invRes.error;
  if (expiringRes.error) throw expiringRes.error;
  if (revenueRes.error) throw revenueRes.error;

  const customers = custAgg.data ?? [];
  const totalCustomers = customers.length;
  const outstandingCredit = customers.reduce((s: number, c: any) => s + Number(c.credit_balance ?? 0), 0);

  const revenueLast30Days = (revenueRes.data ?? []).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

  const recentSales = (recentSalesRes.data ?? []).map((p: any) => ({
    id: p.id,
    date: String(p.purchased_at ?? "").split("T")[0],
    amount: Number(p.amount ?? 0),
    method: p.method ?? "",
    items: p.items_text ?? ""
  }));

  const fastMoving = (fastMovingRes.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name ?? "",
    dailyVelocity: Number(p.daily_velocity ?? 0)
  }));

  // Low stock and expiring soon derived from inventory + products metadata (reorder_point / expiry_date).
  // For now, "low stock" counts items where inventory.stock <= products.reorder_point.
  const productMetaRes = await db.from("products").select("id,reorder_point").eq("pharmacy_id", pharmacyId);
  if (productMetaRes.error) throw productMetaRes.error;
  const reorderByProduct: Record<string, number> = {};
  for (const p of productMetaRes.data ?? []) reorderByProduct[p.id] = Number((p as any).reorder_point ?? 0);

  const lowStockCount = (invRes.data ?? []).filter((r: any) => Number(r.stock ?? 0) <= (reorderByProduct[r.product_id] ?? 0)).length;

  const soon = new Date();
  soon.setDate(soon.getDate() + 60);
  const expiringSoonCount = (expiringRes.data ?? []).filter((r: any) => {
    const d = r.expiry_date ? new Date(r.expiry_date) : null;
    return d && d.getTime() > Date.now() && d.getTime() <= soon.getTime();
  }).length;

  return {
    lowStockCount,
    expiringSoonCount,
    totalCustomers,
    outstandingCredit,
    revenueLast30Days,
    recentSales,
    fastMoving
  };
}

