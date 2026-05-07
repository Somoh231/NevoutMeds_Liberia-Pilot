export function applyInventoryAdjustment(medicines: any[], medicineId: number, delta: number) {
  return medicines.map((m) => (m.id === medicineId ? { ...m, stock: Math.max(0, m.stock + delta) } : m));
}

export function adjustedStockLevel(currentStock: number, delta: number) {
  return Math.max(0, currentStock + delta);
}

