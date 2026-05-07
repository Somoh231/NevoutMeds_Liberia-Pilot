import type { SupplierCatalogueRow, SupplierRow, UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export type UiSupplier = {
  id: string;
  name: string;
  city: string;
  country: string;
  verified: boolean;
  rating: number;
  reviews: number;
  onTimeRate: number;
  leadDays: number;
  minOrder: number;
  paymentTerms: string;
  returnPolicy: string;
  deliveryZones: string[];
};

export type UiSupplierQuote = UiSupplier & {
  price: number;
  stock: string;
  moq: number;
  saving: string;
};

export async function fetchSuppliers(args: { pharmacyId: UUID }): Promise<UiSupplier[]> {
  const db = getSupabaseDb();
  const { data, error } = await db.from("suppliers").select("*").eq("pharmacy_id", args.pharmacyId).order("name");
  if (error) throw error;
  const rows = (data ?? []) as unknown as SupplierRow[];
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city ?? "—",
    country: s.country ?? "—",
    verified: !!s.verified,
    rating: Number(s.rating ?? 4.6),
    reviews: Number(s.reviews ?? 120),
    onTimeRate: Number(s.on_time_rate ?? 96),
    leadDays: Number(s.lead_days ?? 5),
    minOrder: Number(s.min_order ?? 0),
    paymentTerms: s.payment_terms ?? "Net 7 (demo)",
    returnPolicy: s.return_policy ?? "7 days (demo)",
    deliveryZones: s.delivery_zones ?? []
  }));
}

export async function fetchSupplierCatalogueForProduct(args: { pharmacyId: UUID; productId: UUID }) {
  const db = getSupabaseDb();
  // Catalogue rows for productId: we match by product_name to product.name in this UI (Phase 4 simplification).
  // Next step could add supplier_catalogue.product_id to avoid name matching.
  const productRes = await db.from("products").select("id,name,unit_cost,max_stock").eq("pharmacy_id", args.pharmacyId).eq("id", args.productId).single();
  if (productRes.error) throw productRes.error;
  const product = productRes.data as any;

  const { data, error } = await db
    .from("supplier_catalogue")
    .select("*")
    .eq("pharmacy_id", args.pharmacyId)
    .eq("is_active", true)
    .ilike("product_name", product.name);
  if (error) throw error;
  const rows = (data ?? []) as unknown as SupplierCatalogueRow[];

  const suppliers = await fetchSuppliers({ pharmacyId: args.pharmacyId });
  const byId: Record<string, UiSupplier> = Object.fromEntries(suppliers.map((s) => [s.id, s]));

  return rows
    .map((c) => {
      const sup = byId[c.supplier_id];
      if (!sup) return null;
      return { sup, cat: c };
    })
    .filter(Boolean)
    .map(({ sup, cat }: any) => ({
      ...sup,
      price: Number(cat.unit_cost ?? 0),
      stock: cat.stock_status ?? (cat.available_stock && cat.available_stock > 0 ? "In stock" : "Limited"),
      moq: Number(cat.moq ?? 0),
      catalogueId: cat.id
    }));
}

