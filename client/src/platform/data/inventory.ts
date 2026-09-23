import type { InventoryRow, ProductRow, StockMovementRow, UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export type InventoryMedicine = {
  id: string | number;
  name: string;
  brand: string;
  category: string;
  stock: number;
  reorderPoint: number;
  maxStock: number;
  dailyVelocity: number;
  unitCost: number;
  sellingPrice: number;
  unit: string;
  batchId: string;
  /** null when no expiry date is recorded (never invented). */
  expiryDate: string | null;
  supplierId: string | number | null;
  isEssential: boolean;
  requiresPrescription: boolean;
  movements: number[];
};

type ProductWithInventory = ProductRow & { inventory: InventoryRow | null };

export async function fetchInventoryMedicines(args: { pharmacyId: UUID; movementLimit?: number }): Promise<InventoryMedicine[]> {
  const { pharmacyId, movementLimit = 7 } = args;
  const db = getSupabaseDb();

  // Products with inventory in one query (inventory is unique per pharmacy+product).
  const { data: products, error } = await db
    .from("products")
    .select("*, inventory:inventory(*)")
    .eq("pharmacy_id", pharmacyId)
    .order("name", { ascending: true });

  if (error) throw error;

  const rows = (products ?? []) as unknown as ProductWithInventory[];
  const productIds = rows.map((p) => p.id);

  const movementsByProduct: Record<string, number[]> = {};
  if (productIds.length > 0) {
    // Fetch recent movements for all products; group client-side.
    const { data: moves, error: mErr } = await db
      .from("stock_movements")
      .select("*")
      .eq("pharmacy_id", pharmacyId)
      .in("product_id", productIds)
      .order("occurred_at", { ascending: false })
      .limit(Math.max(50, productIds.length * movementLimit)); // best-effort cap
    if (mErr) throw mErr;
    const typed = (moves ?? []) as unknown as StockMovementRow[];
    for (const mv of typed) {
      const key = mv.product_id;
      if (!movementsByProduct[key]) movementsByProduct[key] = [];
      if (movementsByProduct[key].length < movementLimit) movementsByProduct[key].push(mv.delta);
    }
  }

  return rows.map((p) => {
    const inv = p.inventory;
    const expiry = inv?.expiry_date ?? null;
    return {
      id: p.id,
      name: p.name,
      brand: p.brand ?? "",
      category: p.category,
      stock: inv?.stock ?? 0,
      reorderPoint: p.reorder_point,
      maxStock: p.max_stock,
      dailyVelocity: p.daily_velocity,
      unitCost: p.unit_cost,
      sellingPrice: p.selling_price,
      unit: p.unit ?? "",
      batchId: inv?.batch_id ?? "",
      expiryDate: expiry,
      supplierId: p.supplier_id,
      isEssential: p.is_essential,
      requiresPrescription: p.requires_prescription,
      movements: movementsByProduct[p.id] ?? []
    };
  });
}

export async function adjustStock(args: { pharmacyId: UUID; productId: UUID; delta: number; note?: string | null }) {
  const db = getSupabaseDb();
  const { error } = await db.rpc("adjust_stock", {
    p_pharmacy_id: args.pharmacyId,
    p_product_id: args.productId,
    p_delta: Math.trunc(args.delta),
    p_note: args.note ?? null
  });
  if (error) throw error;
}


export type StockMovement = { id: string; delta: number; note: string | null; occurredAt: string };

/** Most recent stock movements for one product (sales, adjustments, imports). */
export async function fetchStockMovements(args: { pharmacyId: UUID; productId: UUID; limit?: number }): Promise<StockMovement[]> {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("stock_movements")
    .select("id,delta,note,occurred_at")
    .eq("pharmacy_id", args.pharmacyId)
    .eq("product_id", args.productId)
    .order("occurred_at", { ascending: false })
    .limit(args.limit ?? 20);
  if (error) throw error;
  return ((data ?? []) as unknown as StockMovementRow[]).map((m) => ({ id: m.id, delta: m.delta, note: m.note, occurredAt: m.occurred_at }));
}
