import { daysUntilExpiry } from "@/platform/utils/dates";
import { getStockStatus, NEEDS_ATTENTION, type StockStatus } from "@/platform/utils/inventoryStatus";

/** Expiry urgency bands used by Inventory, the Morning Briefing and Expiry Alerts. */
export type ExpiryBand = "expired" | "urgent" | "d30" | "d60" | "d90" | "later" | "none";

export function expiryBand(days: number): ExpiryBand {
  if (!Number.isFinite(days)) return "none";
  if (days < 0) return "expired";
  if (days <= 7) return "urgent";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  if (days <= 90) return "d90";
  return "later";
}

export type ProductView = {
  id: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  stock: number;
  reorderPoint: number;
  maxStock: number;
  dailyVelocity: number;
  unitCost: number;
  sellingPrice: number;
  batchId: string;
  expiryDate: string | null;
  supplierId: string | null;
  isEssential: boolean;
  requiresPrescription: boolean;
  pendingSync?: boolean;
  status: StockStatus;
  needsAttention: boolean;
  /** Whole days of stock at the recorded sales rate; null when no rate is recorded. */
  daysOfStock: number | null;
  /** Units to bring stock back to max; 0 when not needed or no max is set. */
  suggestedReorder: number;
  suggestedReorderCost: number;
  valueAtCost: number;
  valueAtRetail: number;
  expiryDays: number;
  expiry: ExpiryBand;
  /** Units likely still on the shelf at expiry (recorded sales rate), valued at cost. */
  unitsAtRiskAtExpiry: number;
  valueAtRiskAtExpiry: number;
};

/**
 * Derives everything a screen needs from one product row. Every figure comes
 * from recorded fields; when a field is missing the result says so (null / 0),
 * it is never estimated.
 */
export function toProductView(m: any): ProductView {
  const stock = Math.max(0, Number(m.stock) || 0);
  const velocity = Math.max(0, Number(m.dailyVelocity) || 0);
  const unitCost = Math.max(0, Number(m.unitCost) || 0);
  const status = getStockStatus({ expiryDate: m.expiryDate ?? null, stock, reorderPoint: Number(m.reorderPoint) || 0, maxStock: Number(m.maxStock) || 0 });
  const expiryDays = daysUntilExpiry(m.expiryDate ?? null);
  const band = expiryBand(expiryDays);
  // Restock is about quantity, independent of which status wins the label
  // (a product can be both expiring and below its reorder point).
  const reorderPoint = Number(m.reorderPoint) || 0;
  const needsRestock = stock <= 0 || (reorderPoint > 0 && stock <= reorderPoint);
  const suggested = needsRestock && m.maxStock > 0 ? Math.max(0, m.maxStock - stock) : 0;
  const unitsAtRisk = band === "none" || band === "later" ? 0 : band === "expired" ? stock : Math.max(0, stock - Math.floor(velocity * Math.max(0, expiryDays)));
  return {
    id: String(m.id),
    name: m.name,
    brand: m.brand ?? "",
    category: m.category ?? "",
    unit: m.unit || "units",
    stock,
    reorderPoint: Number(m.reorderPoint) || 0,
    maxStock: Number(m.maxStock) || 0,
    dailyVelocity: velocity,
    unitCost,
    sellingPrice: Math.max(0, Number(m.sellingPrice) || 0),
    batchId: m.batchId ?? "",
    expiryDate: m.expiryDate ?? null,
    supplierId: m.supplierId != null ? String(m.supplierId) : null,
    isEssential: !!m.isEssential,
    requiresPrescription: !!m.requiresPrescription,
    pendingSync: !!m.pendingSync,
    status,
    needsAttention: NEEDS_ATTENTION.includes(status),
    daysOfStock: velocity > 0 ? Math.floor(stock / velocity) : null,
    suggestedReorder: suggested,
    suggestedReorderCost: suggested * unitCost,
    valueAtCost: stock * unitCost,
    valueAtRetail: stock * (Math.max(0, Number(m.sellingPrice) || 0)),
    expiryDays,
    expiry: band,
    unitsAtRiskAtExpiry: unitsAtRisk,
    valueAtRiskAtExpiry: unitsAtRisk * unitCost
  };
}

export const EXPIRY_LABEL: Record<ExpiryBand, string> = {
  expired: "Expired",
  urgent: "Within 7 days",
  d30: "Within 30 days",
  d60: "30–60 days",
  d90: "60–90 days",
  later: "More than 90 days",
  none: "No expiry recorded"
};
