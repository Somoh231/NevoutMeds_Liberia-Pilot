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

  const { data: prod, error: pErr } = await db
    .from("products")
    .insert({
      pharmacy_id: input.pharmacyId,
      name: input.name,
      brand: input.brand ?? null,
      category: input.category,
      unit: input.unit ?? null,
      unit_cost: input.unitCost,
      selling_price: input.sellingPrice,
      daily_velocity: input.dailyVelocity,
      reorder_point: input.reorderPoint,
      max_stock: input.maxStock,
      supplier_id: null,
      is_essential: !!input.isEssential,
      requires_prescription: !!input.requiresPrescription
    })
    .select("id")
    .single();

  if (pErr) throw pErr;

  const productId = (prod as any).id as UUID;

  const { error: iErr } = await db.from("inventory").upsert(
    {
      pharmacy_id: input.pharmacyId,
      product_id: productId,
      stock: Math.max(0, Math.trunc(input.stock)),
      batch_id: input.batchId ?? null,
      expiry_date: input.expiryDate ?? null
    },
    { onConflict: "pharmacy_id,product_id" }
  );
  if (iErr) throw iErr;

  return { productId };
}

