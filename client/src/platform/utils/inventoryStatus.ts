import { daysUntilExpiry } from "./dates";

export function getStockStatus(m: { expiryDate: string; stock: number; reorderPoint: number; maxStock: number }) {
  const exp = daysUntilExpiry(m.expiryDate);
  if (m.stock <= m.reorderPoint * 0.4) return "critical";
  if (exp <= 14) return "expiring";
  if (m.stock <= m.reorderPoint) return "low";
  if (m.stock > m.maxStock * 0.9) return "overstock";
  return "healthy";
}

export const STATUS = {
  critical: { label: "Critical", color: "#ef4444", bg: "#fef2f2", border: "#fecaca", priority: 0 },
  expiring: { label: "Expiring", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", priority: 1 },
  low: { label: "Low Stock", color: "#f97316", bg: "#fff7ed", border: "#fed7aa", priority: 2 },
  overstock: { label: "Overstock", color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe", priority: 3 },
  healthy: { label: "Healthy", color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0", priority: 4 }
} as const;

