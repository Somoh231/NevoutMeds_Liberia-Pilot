import { daysUntilExpiry } from "./dates";

export type StockStatus = "out" | "critical" | "expiring" | "low" | "overstock" | "untracked" | "healthy";

/**
 * One product's stock status. Rules (Phase 8):
 *  - "untracked": no reorder point and no max stock set, so there is nothing to compare
 *    against. It used to show as "Overstock" with a full purple bar.
 *  - expiry only counts when an expiry date is actually recorded (no invented 2099 date).
 */
export function getStockStatus(m: { expiryDate: string | null; stock: number; reorderPoint: number; maxStock: number }): StockStatus {
  const exp = daysUntilExpiry(m.expiryDate);
  // Running out of a medicine outranks everything; expiry exposure is tracked
  // separately (expiry bands), so a critically low, expiring product still
  // shows up under expiry.
  if (m.stock <= 0) return "out";
  if (m.reorderPoint > 0 && m.stock <= m.reorderPoint * 0.4) return "critical";
  if (exp <= 30) return "expiring";
  if (m.reorderPoint <= 0 && m.maxStock <= 0) return "untracked";
  if (m.stock <= m.reorderPoint) return "low";
  if (m.maxStock > 0 && m.stock > m.maxStock) return "overstock";
  return "healthy";
}

/** Colours are the design tokens' text/tint/edge values (all ≥ 4.5:1). */
export const STATUS = {
  out: { label: "Out of stock", tone: "danger", color: "#b42318", bg: "#fdecea", border: "#f4b8b1", priority: 0 },
  critical: { label: "Critical", tone: "danger", color: "#b42318", bg: "#fdecea", border: "#f4b8b1", priority: 1 },
  expiring: { label: "Expiring", tone: "warning", color: "#8a4b00", bg: "#fff3e0", border: "#f3cf98", priority: 2 },
  low: { label: "Low stock", tone: "warning", color: "#8a4b00", bg: "#fff3e0", border: "#f3cf98", priority: 3 },
  overstock: { label: "Overstock", tone: "info", color: "#1d4ed8", bg: "#eaf1ff", border: "#b9ccf5", priority: 4 },
  untracked: { label: "Set levels", tone: "neutral", color: "#3d5048", bg: "#eef2f0", border: "#dde5e1", priority: 5 },
  healthy: { label: "Healthy", tone: "success", color: "#14683f", bg: "#e6f4ec", border: "#b5dcc6", priority: 6 }
} as const;

export const NEEDS_ATTENTION: StockStatus[] = ["out", "critical", "expiring", "low"];
