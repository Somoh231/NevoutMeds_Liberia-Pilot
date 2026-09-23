import { useMemo, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { timeAgo } from "@/platform/utils/dates";
import { sameProduct } from "@/platform/data/suppliers";
import { toProductView } from "@/platform/features/inventory/model";
import { Alert, Badge, Button, EmptyState, FormField, Input, Select } from "@/platform/ui";
import { Trophy, Truck } from "@/platform/ui/icons";

const STALE_DAYS = 30;
const ageDays = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

/**
 * Compare recorded supplier prices for one product and move straight to an
 * order. Only recorded fields are shown; missing ones say "Not recorded".
 * The recommendation is the lowest total among options that can actually
 * fill the order (MOQ met, not recorded as out of stock) — and it is labelled
 * as based on recorded prices, never as a guarantee.
 */
export default function PriceCompare({ medicines, suppliers, catalogue, initialProductId, onOrder, onRecordPrice }) {
  const products = useMemo(() => medicines.map(toProductView).sort((a, b) => Number(b.suggestedReorder > 0) - Number(a.suggestedReorder > 0) || a.name.localeCompare(b.name)), [medicines]);
  const [productId, setProductId] = useState(initialProductId ?? products.find((p) => p.suggestedReorder > 0)?.id ?? products[0]?.id ?? "");
  const product = products.find((p) => p.id === String(productId)) ?? null;
  const [qtyInput, setQtyInput] = useState("");
  const qty = Math.max(1, Math.trunc(Number(qtyInput) || product?.suggestedReorder || product?.reorderPoint || 1));

  const options = useMemo(() => {
    if (!product) return [];
    const byId = new Map(suppliers.map((s) => [s.id, s]));
    return (catalogue ?? [])
      .filter((c) => sameProduct(c.productName, product.name) && byId.has(c.supplierId) && c.unitCost > 0)
      .map((c) => {
        const s = byId.get(c.supplierId);
        const orderQty = c.moq && qty < c.moq ? c.moq : qty;
        const outOfStock = /out/i.test(c.stockStatus ?? "") || c.availableStock === 0;
        const age = ageDays(c.updatedAt);
        return {
          c,
          s,
          orderQty,
          total: orderQty * c.unitCost,
          saving: product.unitCost > 0 ? (product.unitCost - c.unitCost) * orderQty : null,
          pct: product.unitCost > 0 ? Math.round(((product.unitCost - c.unitCost) / product.unitCost) * 100) : null,
          moqRaised: orderQty > qty,
          outOfStock,
          stale: age !== null && age > STALE_DAYS,
          age
        };
      })
      // Lowest cash out for the order (a minimum order can make a cheaper unit
      // price the dearer choice), then unit price, then shorter lead time.
      .sort((a, b) => Number(a.outOfStock) - Number(b.outOfStock) || a.total - b.total || a.c.unitCost - b.c.unitCost || (a.s.leadDays ?? 99) - (b.s.leadDays ?? 99));
  }, [product, suppliers, catalogue, qty]);

  const eligible = options.filter((o) => !o.outOfStock);
  const best = eligible[0] ?? null;
  const cheapestPrice = options.length ? Math.min(...options.map((o) => o.c.unitCost)) : 0;

  if (products.length === 0) {
    return <EmptyState title="No products yet">Add products in Inventory first, then compare supplier prices for them.</EmptyState>;
  }

  return (
    <div className="nv-stack">
      <div className="nv-grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", alignItems: "end" }}>
        <FormField label="Product">
          <Select value={productId} onChange={(e) => { setProductId(e.target.value); setQtyInput(""); }}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.suggestedReorder > 0 ? " · needs reorder" : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Quantity to order" hint={product?.suggestedReorder > 0 ? `Suggested ${product.suggestedReorder} (to your maximum)` : undefined}>
          <Input type="number" inputMode="numeric" min={1} value={qtyInput} placeholder={String(qty)} onChange={(e) => setQtyInput(e.target.value)} />
        </FormField>
        {product && (
          <dl className="nv-kv" style={{ margin: 0 }}>
            <div>
              <dt>You pay now</dt>
              <dd>{product.unitCost > 0 ? fmt(product.unitCost) : "—"}<small>{product.unitCost > 0 ? "recorded unit cost" : "no unit cost recorded"}</small></dd>
            </div>
          </dl>
        )}
      </div>

      {options.length === 0 ? (
        <EmptyState
          icon={<Truck size={26} />}
          title={`No supplier prices recorded for ${product?.name ?? "this product"}`}
          actions={onRecordPrice && <Button variant="primary" onClick={() => onRecordPrice(product)}>Record a supplier price</Button>}
        >
          Record the prices suppliers quote you, and NevOut Meds will rank them here.
        </EmptyState>
      ) : (
        <>
          {options.length === 1 && <Alert tone="info">Only one supplier price is recorded for this product, so there is nothing to compare yet.</Alert>}
          {best?.stale && <Alert tone="warning" title="The best price may be out of date">It was recorded {timeAgo(best.c.updatedAt)}. Confirm it with the supplier before ordering.</Alert>}
          <ol className="nv-compare" aria-label={`Supplier prices for ${product.name}, best first`}>
            {options.map((o) => {
              const isBest = best && o.c.id === best.c.id;
              return (
                <li key={o.c.id} className={`nv-compare__card${isBest ? " is-best" : ""}${o.outOfStock ? " is-muted" : ""}`}>
                  <div className="nv-compare__head">
                    <div style={{ minWidth: 0 }}>
                      {isBest && (
                        <span className="nv-compare__flag"><Trophy size={14} aria-hidden="true" /> Best recorded price</span>
                      )}
                      <h4 className="nv-compare__name">{o.s.name}</h4>
                      <p className="nv-hint">{[o.s.city, o.s.country].filter(Boolean).join(", ") || "Location not recorded"}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="nv-compare__price nv-num">{fmt(o.c.unitCost)}</div>
                      <div className="nv-hint">per {o.c.unit || product.unit || "unit"}</div>
                    </div>
                  </div>
                  <dl className="nv-compare__facts">
                    <div><dt>Order total</dt><dd className="nv-num">{fmt(o.total)}<small>{o.orderQty} {product.unit}{o.moqRaised ? " (raised to the minimum order)" : ""}</small></dd></div>
                    <div>
                      <dt>vs what you pay</dt>
                      <dd className="nv-num" style={{ color: o.saving > 0 ? "var(--nv-success)" : o.saving < 0 ? "var(--nv-danger)" : undefined }}>
                        {o.saving === null ? "—" : o.saving > 0 ? `Save ${fmt(o.saving)}` : o.saving < 0 ? `${fmt(-o.saving)} more` : "Same"}
                        <small>{o.pct === null ? "no current cost recorded" : `${o.pct > 0 ? `${o.pct}% less` : o.pct < 0 ? `${-o.pct}% more` : "same price"} per unit`}</small>
                      </dd>
                    </div>
                    <div><dt>Minimum order</dt><dd>{o.c.moq ?? "Not recorded"}</dd></div>
                    <div><dt>Availability</dt><dd>{o.c.stockStatus ?? (o.c.availableStock != null ? `${o.c.availableStock} available` : "Not recorded")}</dd></div>
                    <div><dt>Lead time</dt><dd>{o.s.leadDays != null ? `${o.s.leadDays} days` : "Not recorded"}</dd></div>
                    <div><dt>Reliability</dt><dd>{o.s.onTimeRate != null ? `${o.s.onTimeRate}% on time` : o.s.rating != null ? `${o.s.rating} / 5` : "Not recorded"}</dd></div>
                    <div><dt>Delivery cost</dt><dd>Not recorded<small>order total is before delivery</small></dd></div>
                    <div><dt>Price recorded</dt><dd style={{ color: o.stale ? "var(--nv-warning)" : undefined }}>{timeAgo(o.c.updatedAt)}{o.stale && <small>may be out of date</small>}</dd></div>
                  </dl>
                  <div className="nv-compare__foot">
                    {o.outOfStock ? <Badge tone="danger">Recorded as out of stock</Badge> : o.c.unitCost === cheapestPrice && !isBest ? <Badge tone="neutral">Same lowest price</Badge> : <span />}
                    <Button variant={isBest ? "primary" : "secondary"} disabled={o.outOfStock} onClick={() => onOrder(product, o.s.id, o.orderQty)} aria-label={`Order ${o.orderQty} ${product.name} from ${o.s.name}`}>
                      Order from {o.s.name}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="nv-hint">Ranked by recorded unit price for suppliers that can fill the order. Delivery costs and reliability are shown only where recorded.</p>
        </>
      )}
    </div>
  );
}
