export function buildReorderWhatsappPreview(opts: {
  supplierName?: string;
  qty: number;
  medicineName: string;
  brand: string;
  locationLabel: string;
}) {
  return `"Hi ${opts.supplierName}, please supply ${opts.qty} units of ${opts.medicineName} (${opts.brand}). Confirm ETA. — ${opts.locationLabel}"`;
}
