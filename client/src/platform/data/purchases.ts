import type { UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export type RecordPurchaseItem = {
  productId: UUID;
  name: string;
  qty: number;
  unitPrice: number;
};

export async function recordPurchase(args: {
  pharmacyId: UUID;
  customerId: UUID;
  method: string;
  staffId: UUID;
  items: RecordPurchaseItem[];
}) {
  const db = getSupabaseDb();
  const payload = args.items.map((i) => ({
    product_id: i.productId,
    name: i.name,
    qty: i.qty,
    unit_price: i.unitPrice
  }));

  const { data, error } = await db.rpc("record_purchase", {
    p_pharmacy_id: args.pharmacyId,
    p_customer_id: args.customerId,
    p_method: args.method,
    p_staff_id: args.staffId,
    p_items: payload
  });
  if (error) throw error;
  return data as string;
}


export type ProductSale = { productId: string | null; name: string; qty: number; revenue: number; soldAt: string };

/** Sale lines in a period (purchase_items joined to their sale's date). */
export async function fetchProductSales(args: { pharmacyId: UUID; sinceISO: string }): Promise<ProductSale[]> {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("purchase_items")
    .select("product_id,name,qty,line_total,purchases!inner(purchased_at)")
    .eq("pharmacy_id", args.pharmacyId)
    .gte("purchases.purchased_at", args.sinceISO)
    .limit(5000);
  if (error) throw error;
  return ((data ?? []) as any[]).map((l) => ({
    productId: l.product_id,
    name: l.name,
    qty: Number(l.qty ?? 0),
    revenue: Number(l.line_total ?? 0),
    soldAt: (Array.isArray(l.purchases) ? l.purchases[0] : l.purchases)?.purchased_at ?? ""
  }));
}
