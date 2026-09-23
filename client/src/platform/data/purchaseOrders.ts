import type { UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export async function createPurchaseOrder(args: {
  pharmacyId: UUID;
  supplierId: UUID;
  createdBy: UUID;
  whatsappMessage: string;
  total: number;
  items: Array<{ productId: UUID; name: string; qty: number; unitPrice: number }>;
}) {
  const db = getSupabaseDb();
  // One transaction for the order and its lines; the total is computed
  // server-side, so a half-written order can no longer exist (Phase 3).
  const { data, error } = await db.rpc("create_purchase_order", {
    p_pharmacy_id: args.pharmacyId,
    p_supplier_id: args.supplierId,
    p_items: args.items.map((i) => ({
      product_id: i.productId ?? null,
      name: i.name,
      qty: i.qty,
      unit_price: i.unitPrice
    })),
    p_whatsapp_message: args.whatsappMessage,
    p_currency: "USD"
  });
  if (error) throw error;
  return data as UUID;
}

export type PurchaseOrderLine = { name: string; qty: number; unitPrice: number; lineTotal: number; productId: string | null };
/** Statuses the database actually records. There is no receiving workflow yet. */
export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";
export type PurchaseOrder = {
  id: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  orderedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  total: number;
  currency: string;
  whatsappMessage: string | null;
  items: PurchaseOrderLine[];
};

export async function fetchPurchaseOrders(args: { pharmacyId: UUID }): Promise<PurchaseOrder[]> {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("purchase_orders")
    .select("id,supplier_id,status,ordered_at,received_at,total,currency,whatsapp_message,created_at")
    .eq("pharmacy_id", args.pharmacyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const orders = (data ?? []) as any[];
  const ids = orders.map((o) => o.id);
  const linesByOrder: Record<string, PurchaseOrderLine[]> = {};
  if (ids.length) {
    const { data: lines, error: lErr } = await db
      .from("purchase_order_items")
      .select("purchase_order_id,product_id,name,qty,unit_price,line_total")
      .eq("pharmacy_id", args.pharmacyId)
      .in("purchase_order_id", ids);
    if (lErr) throw lErr;
    for (const l of (lines ?? []) as any[]) {
      (linesByOrder[l.purchase_order_id] ??= []).push({ name: l.name, qty: Number(l.qty), unitPrice: Number(l.unit_price), lineTotal: Number(l.line_total), productId: l.product_id });
    }
  }
  return orders.map((o) => ({
    id: o.id,
    supplierId: o.supplier_id,
    status: o.status,
    orderedAt: o.ordered_at,
    receivedAt: o.received_at,
    createdAt: o.created_at,
    total: Number(o.total ?? 0),
    currency: o.currency ?? "USD",
    whatsappMessage: o.whatsapp_message ?? null,
    items: linesByOrder[o.id] ?? []
  }));
}

/** Adds a supplier (direct insert; RLS scopes it to this pharmacy). Needs a connection. */
export async function createSupplier(args: {
  pharmacyId: UUID;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  country?: string | null;
  leadDays?: number | null;
  paymentTerms?: string | null;
}) {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("suppliers")
    .insert({
      pharmacy_id: args.pharmacyId,
      name: args.name,
      phone: args.phone || null,
      whatsapp: args.whatsapp || null,
      email: args.email || null,
      city: args.city || null,
      country: args.country || null,
      lead_days: args.leadDays ?? null,
      payment_terms: args.paymentTerms || null
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Records a supplier's current price for a product. One current price per
 * supplier and product name: an existing entry is updated (there is no price
 * history table yet, so the previous price is not kept).
 */
export async function recordSupplierPrice(args: {
  pharmacyId: UUID;
  supplierId: UUID;
  productName: string;
  unit?: string | null;
  unitCost: number;
  moq?: number | null;
  stockStatus?: string | null;
}) {
  const db = getSupabaseDb();
  const { data: existing, error: fErr } = await db
    .from("supplier_catalogue")
    .select("id")
    .eq("pharmacy_id", args.pharmacyId)
    .eq("supplier_id", args.supplierId)
    .ilike("product_name", args.productName)
    .limit(1);
  if (fErr) throw fErr;
  const row = {
    unit_cost: args.unitCost,
    moq: args.moq ?? null,
    stock_status: args.stockStatus || null,
    unit: args.unit || null,
    is_active: true,
    updated_at: new Date().toISOString()
  };
  if (existing && existing.length) {
    const { error } = await db.from("supplier_catalogue").update(row).eq("id", (existing[0] as any).id).eq("pharmacy_id", args.pharmacyId);
    if (error) throw error;
    return (existing[0] as any).id as string;
  }
  const { data, error } = await db
    .from("supplier_catalogue")
    .insert({ ...row, pharmacy_id: args.pharmacyId, supplier_id: args.supplierId, product_name: args.productName })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}
