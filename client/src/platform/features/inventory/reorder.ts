export function computeReorderQty(item: { maxStock: number; stock: number }) {
  return Math.max(0, item.maxStock - item.stock);
}

export function computeReorderCost(qty: number, unitCost: number) {
  return qty * unitCost;
}

