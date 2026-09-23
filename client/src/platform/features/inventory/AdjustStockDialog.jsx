import { useEffect, useState } from "react";
import { adjustedStockLevel, applyInventoryAdjustment } from "@/platform/features/inventory/adjustments";
import { Button, Chip, Dialog, FormField, Input, Textarea } from "@/platform/ui";

const REASONS = ["Delivery received", "Stock count correction", "Damaged or expired", "Returned by customer"];

/**
 * Stock adjustment through adjust_stock_idempotent (via onAdjustStock).
 * Persist first: the shelf count only changes in the UI once the server
 * accepted it or it was durably queued on this device.
 * `preset` pre-fills a change and reason (e.g. an expiry write-off).
 */
export default function AdjustStockDialog({ item, onClose, onAdjustStock, setMedicines, onShowToast, preset }) {
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setQty(preset?.delta ?? 0);
    setNote(preset?.note ?? "");
  }, [item?.id, preset?.delta, preset?.note]);

  const commit = async (e) => {
    e?.preventDefault();
    if (!item || !qty) return;
    let queued = false;
    if (typeof onAdjustStock === "function") {
      setSaving(true);
      try {
        const outcome = await onAdjustStock({ productId: item.id, productName: item.name, delta: qty, note: note || undefined });
        queued = outcome?.status === "queued";
      } catch (err) {
        onShowToast(err?.message || "Stock not updated — please try again", "error");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setMedicines((prev) => applyInventoryAdjustment(prev, item.id, qty));
    onShowToast(
      queued
        ? `${item.name} change saved on this device — will sync when you are back online`
        : `${item.name} updated — now ${adjustedStockLevel(item.stock, qty)} ${item.unit}`,
      queued ? "info" : "success"
    );
    onClose();
  };

  return (
    <Dialog open={!!item} onClose={onClose} title="Adjust Stock" description={item ? `${item.name} · ${item.stock} ${item.unit} in stock` : undefined} width={480}>
      {item && (
        <form className="nv-stack" onSubmit={commit} noValidate>
          <FormField label="Change in stock" hint="Positive to add (a delivery), negative to remove (damage, expiry, a count correction).">
            <Input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.trunc(Number(e.target.value) || 0))} />
          </FormField>
          <div className="nv-stepper" role="group" aria-label="Quick change">
            {[-10, -1, 1, 10].map((d) => (
              <Button key={d} size="sm" onClick={() => setQty((v) => v + d)} aria-label={`${d > 0 ? "Add" : "Remove"} ${Math.abs(d)}`}>
                {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
              </Button>
            ))}
          </div>
          <div role="group" aria-label="Reason">
            <div className="nv-label" style={{ marginBottom: 6 }}>Reason</div>
            <div className="nv-chips" style={{ flexWrap: "wrap" }}>
              {REASONS.map((r) => (
                <Chip key={r} pressed={note === r} onClick={() => setNote(r)}>{r}</Chip>
              ))}
            </div>
          </div>
          <FormField label="Note" hint="Kept in this product’s stock history.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 72 }} />
          </FormField>
          <p className="nv-hint" aria-live="polite" style={{ fontSize: "0.9375rem", color: "var(--nv-text)" }}>
            New stock: <strong className="nv-num">{adjustedStockLevel(item.stock, qty)} {item.unit}</strong>
            {item.stock + qty < 0 && <span style={{ color: "var(--nv-danger)" }}> (cannot go below zero)</span>}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!qty}>Apply adjustment</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
