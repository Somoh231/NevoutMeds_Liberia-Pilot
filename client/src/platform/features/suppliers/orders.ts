export function calcSuggestedOrderQty(opts: { moq: number; desiredUnits: number }) {
  return Math.max(opts.moq, opts.desiredUnits);
}

export function clampOrderQtyToMoq(moq: number, qty: number) {
  return Math.max(moq, qty);
}

export function calcOrderTotal(unitPrice: number, qty: number) {
  return qty * unitPrice;
}

export function calcOrderSavings(currentUnitCost: number, supplierUnitPrice: number, qty: number) {
  return qty * (currentUnitCost - supplierUnitPrice);
}

