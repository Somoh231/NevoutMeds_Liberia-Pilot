import type { UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export type CreateProductInput = {
  pharmacyId: UUID;
  name: string;
  brand?: string | null;
  category: string;
  unit?: string | null;
  unitCost: number;
  sellingPrice: number;
  stock: number;
  reorderPoint: number;
  maxStock: number;
  dailyVelocity: number;
  batchId?: string | null;
  expiryDate?: string | null; // ISO date
  isEssential?: boolean;
  requiresPrescription?: boolean;
};

export async function createProductWithInventory(input: CreateProductInput): Promise<{ productId: UUID }> {
  const db = getSupabaseDb();

  // Atomic server-side: product + inventory + opening stock movement in one
  // transaction. Direct inserts are no longer permitted (migration 0011).
  const { data, error } = await db.rpc("create_product", {
    p_pharmacy_id: input.pharmacyId,
    p_name: input.name,
    p_category: input.category,
    p_unit_cost: input.unitCost,
    p_selling_price: input.sellingPrice,
    p_stock: Math.max(0, Math.trunc(input.stock)),
    p_brand: input.brand ?? null,
    p_unit: input.unit ?? null,
    p_reorder_point: input.reorderPoint,
    p_max_stock: input.maxStock,
    p_daily_velocity: input.dailyVelocity,
    p_batch_id: input.batchId ?? null,
    p_expiry_date: input.expiryDate ?? null,
    p_is_essential: !!input.isEssential,
    p_requires_prescription: !!input.requiresPrescription
  });
  if (error) throw error;

  return { productId: data as UUID };
}
