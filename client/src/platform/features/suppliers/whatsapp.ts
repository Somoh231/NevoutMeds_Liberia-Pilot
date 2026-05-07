export function buildReorderWhatsappPreview(opts: {
  supplierName?: string;
  qty: number;
  medicineName: string;
  brand: string;
  locationLabel: string;
}) {
  return `"Hi ${opts.supplierName}, please supply ${opts.qty} units of ${opts.medicineName} (${opts.brand}). Confirm ETA. — ${opts.locationLabel}"`;
}

export function calcSupplierSavingsPct(unitCost: number, supplierPrice: number) {
  return ((unitCost - supplierPrice) / unitCost * 100).toFixed(0);
}

export function calcTotalSaving(unitCost: number, supplierPrice: number, units: number) {
  return ((unitCost - supplierPrice) * units).toFixed(2);
}

