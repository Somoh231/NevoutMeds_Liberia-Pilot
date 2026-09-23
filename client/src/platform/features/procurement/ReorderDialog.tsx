import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/platform/auth/AuthProvider";
import { useSuppliers } from "@/platform/data/useSuppliers";
import { useSupplierCatalogue } from "@/platform/data/useSupplierCatalogue";
import { useCreatePurchaseOrder } from "@/platform/data/useCreatePurchaseOrder";
import { sameProduct } from "@/platform/data/suppliers";
import { buildReorderWhatsappPreview } from "@/platform/features/suppliers/whatsapp";
import { fmt } from "@/platform/utils/format";
import type { ProductView } from "@/platform/features/inventory/model";
import { Alert, Button, Dialog, EmptyState, FormField, Input, Select } from "@/platform/ui";
import { Truck } from "@/platform/ui/icons";

export const whatsappLink = (phone: string | null | undefined, text: string) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

/**
 * Reorder one product. Prices come from the supplier's recorded catalogue when
 * there is one, otherwise from the product's own unit cost (and it says so).
 * Creating the order records it in NevOut Meds; sending it is a separate,
 * explicit step in WhatsApp — the app never claims a message was sent.
 */
export default function ReorderDialog({
  product,
  onClose,
  onCompare,
  onShowToast,
  presetSupplierId,
  presetQty
}: {
  product: ProductView | null;
  onClose: () => void;
  onCompare?: (productId: string) => void;
  onShowToast?: (msg: string, type?: string) => void;
  presetSupplierId?: string | null;
  presetQty?: number | null;
}) {
  const { user } = useAuth();
  const suppliersQ = useSuppliers();
  const catalogueQ = useSupplierCatalogue();
  const createPO = useCreatePurchaseOrder();
  const suppliers = suppliersQ.data ?? [];
  const [supplierId, setSupplierId] = useState<string>("");
  const [qty, setQty] = useState<number>(0);
  const [created, setCreated] = useState<{ status: "synced" | "queued"; message: string; phone: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const quotes = useMemo(
    () => (product ? (catalogueQ.data ?? []).filter((c) => sameProduct(c.productName, product.name)) : []),
    [catalogueQ.data, product]
  );

  useEffect(() => {
    if (!product) return;
    setCreated(null);
    setError(null);
    setQty(presetQty && presetQty > 0 ? presetQty : product.suggestedReorder > 0 ? product.suggestedReorder : Math.max(1, product.reorderPoint || 1));
    const cheapest = [...quotes].sort((a, b) => a.unitCost - b.unitCost)[0];
    setSupplierId(presetSupplierId ?? product.supplierId ?? cheapest?.supplierId ?? suppliers[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, presetSupplierId, presetQty]);

  if (!product) return <Dialog open={false} onClose={onClose} title="Reorder" />;

  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const quote = quotes.find((q) => q.supplierId === supplierId) ?? null;
  const unitPrice = quote ? quote.unitCost : product.unitCost;
  const total = Math.max(0, qty) * unitPrice;
  const belowMoq = quote?.moq != null && qty < quote.moq;
  const message = buildReorderWhatsappPreview({
    supplierName: supplier?.name,
    qty,
    medicineName: product.name,
    brand: product.brand || product.unit,
    locationLabel: user?.pharmacy ?? ""
  }).replace(/^"|"$/g, "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) return setError("Choose a supplier.");
    if (!Number.isFinite(qty) || qty <= 0) return setError("Enter a quantity above zero.");
    setError(null);
    try {
      const res = await createPO.mutateAsync({
        supplierId: supplier.id,
        whatsappMessage: message,
        total,
        items: [{ productId: product.id, name: product.name, qty: Math.trunc(qty), unitPrice }]
      });
      const queued = (res as { status?: string })?.status === "queued";
      setCreated({ status: queued ? "queued" : "synced", message, phone: supplier.whatsapp ?? supplier.phone });
      onShowToast?.(queued ? `Order saved on this device — will sync when you are back online` : `Order recorded for ${supplier.name}`, queued ? "info" : "success");
    } catch (err: any) {
      setError(err?.message ? `The order was not recorded: ${err.message}` : "The order was not recorded. Try again.");
    }
  };

  return (
    <Dialog open={!!product} onClose={onClose} title={`Reorder ${product.name}`} description={`${product.stock} ${product.unit} in stock${product.reorderPoint ? ` · reorder at ${product.reorderPoint}` : ""}`} width={560}>
      {suppliers.length === 0 && !suppliersQ.isLoading ? (
        <EmptyState icon={<Truck size={26} />} title="No suppliers yet">
          Add the suppliers you buy from in Suppliers, then reorder from here.
        </EmptyState>
      ) : created ? (
        <div className="nv-stack">
          <Alert tone={created.status === "queued" ? "pending" : "success"} title={created.status === "queued" ? "Saved on this device · Pending sync" : "Order recorded"}>
            {created.status === "queued"
              ? "The order will be recorded in NevOut Meds when this device is back online."
              : "It is listed under Suppliers › Orders."}{" "}
            Nothing has been sent to the supplier yet.
          </Alert>
          <div className="nv-card" style={{ background: "var(--nv-surface-inset)", boxShadow: "none", whiteSpace: "pre-wrap", fontSize: "0.9375rem" }}>{created.message}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {created.phone ? (
              <a className="nv-btn nv-btn--primary" href={whatsappLink(created.phone, created.message)} target="_blank" rel="noreferrer">Open WhatsApp to send</a>
            ) : (
              <Alert tone="info">This supplier has no WhatsApp or phone number recorded. Copy the message above and send it your usual way.</Alert>
            )}
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form className="nv-stack" onSubmit={submit} noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <FormField label="Supplier" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="" disabled>Choose a supplier</option>
              {suppliers.map((s) => {
                const q = quotes.find((x) => x.supplierId === s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {s.name}{q ? ` — ${fmt(q.unitCost)} per unit` : ""}
                  </option>
                );
              })}
            </Select>
          </FormField>
          <FormField
            label="Quantity"
            required
            hint={product.suggestedReorder > 0 ? `Suggested: ${product.suggestedReorder} (brings stock back to your maximum of ${product.maxStock})` : product.maxStock <= 0 ? "Set a maximum stock level on the product to get a suggested quantity." : undefined}
            error={belowMoq ? `This supplier’s minimum order is ${quote!.moq}.` : undefined}
          >
            <Input type="number" inputMode="numeric" min={1} value={Number.isFinite(qty) ? qty : ""} onChange={(e) => setQty(Math.trunc(Number(e.target.value)))} />
          </FormField>
          <dl className="nv-kv" style={{ margin: 0 }}>
            <div>
              <dt>Unit price</dt>
              <dd>{fmt(unitPrice)}<small>{quote ? "from this supplier’s recorded price" : "your recorded unit cost (no supplier price recorded)"}</small></dd>
            </div>
            <div>
              <dt>Order total</dt>
              <dd>{fmt(total)}</dd>
            </div>
            <div>
              <dt>Lead time</dt>
              <dd>{supplier?.leadDays != null ? `${supplier.leadDays} days` : "Not recorded"}</dd>
            </div>
          </dl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            {onCompare && quotes.length > 1 && (
              <Button variant="ghost" onClick={() => onCompare(product.id)}>Compare {quotes.length} supplier prices</Button>
            )}
            <Button type="submit" variant="primary" loading={createPO.isPending} disabled={belowMoq}>Create order</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
