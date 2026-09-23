import type { SupplierCatalogueRow, SupplierRow, UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";
import { getActiveTenantConfig } from "@/platform/country/tenant";

/**
 * A supplier as recorded by this pharmacy. Fields the pharmacy has not recorded
 * are null — never defaulted. (Until Phase 8 this mapper filled gaps with an
 * invented 4.6★ rating, 120 reviews, 96% on-time and "Net 7" terms.)
 */
export type UiSupplier = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  leadDays: number | null;
  verified: boolean;
  rating: number | null;
  onTimeRate: number | null;
  minOrder: number | null;
  paymentTerms: string | null;
};

export type CatalogueEntry = {
  id: string;
  supplierId: string;
  productName: string;
  brand: string | null;
  unit: string | null;
  unitCost: number;
  currency: string;
  moq: number | null;
  stockStatus: string | null;
  availableStock: number | null;
  updatedAt: string;
};

export type UiSupplierQuote = UiSupplier & {
  price: number;
  moq: number | null;
  stockStatus: string | null;
  availableStock: number | null;
  currency: string;
  priceUpdatedAt: string;
  catalogueId: string;
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function toUiSupplier(s: SupplierRow): UiSupplier {
  return {
    id: s.id,
    name: s.name,
    city: s.city ?? null,
    country: s.country ?? null,
    phone: s.phone ?? null,
    whatsapp: s.whatsapp ?? null,
    email: s.email ?? null,
    leadDays: num(s.lead_days),
    verified: !!s.verified,
    rating: num(s.rating),
    onTimeRate: num(s.on_time_rate),
    minOrder: num(s.min_order),
    paymentTerms: s.payment_terms ?? null
  };
}

export function toCatalogueEntry(c: SupplierCatalogueRow & { stock_status?: string | null; available_stock?: number | null }): CatalogueEntry {
  return {
    id: c.id,
    supplierId: c.supplier_id,
    productName: c.product_name,
    brand: c.brand ?? null,
    unit: c.unit ?? null,
    unitCost: Number(c.unit_cost ?? 0),
    currency: (c as { currency?: string }).currency ?? getActiveTenantConfig().currency,
    moq: num(c.moq),
    stockStatus: c.stock_status ?? null,
    availableStock: num(c.available_stock),
    updatedAt: c.updated_at
  };
}

export async function fetchSuppliers(args: { pharmacyId: UUID }): Promise<UiSupplier[]> {
  const db = getSupabaseDb();
  const { data, error } = await db.from("suppliers").select("*").eq("pharmacy_id", args.pharmacyId).order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as SupplierRow[]).map(toUiSupplier);
}

/** Every active catalogue price this pharmacy has recorded. */
export async function fetchCatalogue(args: { pharmacyId: UUID }): Promise<CatalogueEntry[]> {
  const db = getSupabaseDb();
  const { data, error } = await db.from("supplier_catalogue").select("*").eq("pharmacy_id", args.pharmacyId).eq("is_active", true).limit(2000);
  if (error) throw error;
  return ((data ?? []) as unknown as SupplierCatalogueRow[]).map(toCatalogueEntry);
}

/** Catalogue entries match products by name (case-insensitive); there is no product_id link yet. */
export const sameProduct = (catalogueName: string, productName: string) => catalogueName.trim().toLowerCase() === productName.trim().toLowerCase();

export async function fetchSupplierCatalogueForProduct(args: { pharmacyId: UUID; productId: UUID }): Promise<UiSupplierQuote[]> {
  const db = getSupabaseDb();
  const productRes = await db.from("products").select("id,name").eq("pharmacy_id", args.pharmacyId).eq("id", args.productId).single();
  if (productRes.error) throw productRes.error;
  const product = productRes.data as { name: string };
  const [catalogue, suppliers] = await Promise.all([fetchCatalogue({ pharmacyId: args.pharmacyId }), fetchSuppliers({ pharmacyId: args.pharmacyId })]);
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  return catalogue
    .filter((c) => sameProduct(c.productName, product.name) && byId.has(c.supplierId))
    .map((c) => ({
      ...byId.get(c.supplierId)!,
      price: c.unitCost,
      moq: c.moq,
      stockStatus: c.stockStatus,
      availableStock: c.availableStock,
      currency: c.currency,
      priceUpdatedAt: c.updatedAt,
      catalogueId: c.id
    }));
}
