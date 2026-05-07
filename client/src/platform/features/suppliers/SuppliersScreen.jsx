import { useState } from "react";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { SUPPLIER_DATA } from "@/platform/seed/suppliers";
import { fmt } from "@/platform/utils/format";
import { Modal } from "@/platform/components/primitives";
import { calcSupplierSavingsPct, calcTotalSaving } from "@/platform/features/suppliers/whatsapp";
import { calcOrderSavings, calcOrderTotal, calcSuggestedOrderQty, clampOrderQtyToMoq } from "@/platform/features/suppliers/orders";
import { useSupplierQuotes } from "@/platform/data/useSupplierQuotes";
import { useSuppliers } from "@/platform/data/useSuppliers";
import { usePurchaseOrders } from "@/platform/data/usePurchaseOrders";
import { useCreatePurchaseOrder } from "@/platform/data/useCreatePurchaseOrder";

export default function SuppliersScreen({ medicines, onShowToast }) {
  const [view, setView] = useState("compare"); // compare | suppliers | orders
  const [selectedMed, setSelectedMed] = useState(medicines[0]);
  const [selectedSup, setSelectedSup] = useState(null);
  const [orderModal, setOrderModal] = useState(null);
  const [orderQty, setOrderQty] = useState(50);

  const suppliersQ = useSuppliers();
  const ordersQ = usePurchaseOrders();
  const createOrderM = useCreatePurchaseOrder();
  const quotesQ = useSupplierQuotes(selectedMed?.id);

  // Build price comparison for selected medicine
  const rawQuotes = quotesQ.data ?? [];
  const priceData = (rawQuotes.length ? rawQuotes : [])
    .map((q) => ({
      ...q,
      price: q.price,
      stock: q.stock,
      moq: q.moq || 0,
      saving: calcSupplierSavingsPct(selectedMed.unitCost, q.price)
    }))
    .sort((a, b) => a.price - b.price);

  const cheapest = priceData[0];
  const totalSaving = cheapest ? calcTotalSaving(selectedMed.unitCost, cheapest.price, selectedMed.maxStock - selectedMed.stock) : 0;

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Supplier Marketplace</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span>Compare prices · Place orders · Track deliveries</span>
          {(suppliersQ.isFetching || quotesQ.isFetching || ordersQ.isFetching) && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>Syncing…</span>}
          {(suppliersQ.error || quotesQ.error || ordersQ.error) && <span style={{ fontSize: 12, color: "#f97316", fontWeight: 800 }}>Using cached data</span>}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, marginBottom: 22, background: "#f1f5f9", borderRadius: 11, padding: 4, width: "fit-content" }}>
        {[
          ["compare", "💰 Price Compare"],
          ["suppliers", "🏢 Suppliers"],
          ["orders", "📋 Order History"]
        ].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: view === v ? "#fff" : "transparent", color: view === v ? SLATE : "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, boxShadow: view === v ? "0 1px 4px #0000001a" : "none", transition: "all 0.15s" }}>
            {l}
          </button>
        ))}
      </div>

      {/* PRICE COMPARE TAB */}
      {view === "compare" && (
        <div>
          {/* Medicine selector */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Select Medicine to Compare</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {medicines.map((m) => (
                <button key={m.id} onClick={() => setSelectedMed(m)} style={{ padding: "8px 14px", borderRadius: 9, border: `1.5px solid ${selectedMed.id === m.id ? "#10b981" : "#e2e8f0"}`, background: selectedMed.id === m.id ? "#f0fdf4" : "#fff", color: selectedMed.id === m.id ? "#047857" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}>
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Current price card */}
          <div style={{ background: "linear-gradient(135deg,#020617,#0c1a2e)", borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6ee7b7", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>You Currently Pay</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>
                {fmt(selectedMed.unitCost)}
                <span style={{ fontSize: 14, fontWeight: 500, color: "#94a3b8" }}> / {selectedMed.unit.replace(/s$/, "")}</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>from your default supplier · {selectedMed.name}</div>
            </div>
            {cheapest && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6ee7b7", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Best Available Price</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#10b981" }}>{fmt(cheapest.price)}</div>
                <div style={{ fontSize: 12, color: "#6ee7b7", marginTop: 4 }}>Save {fmt(totalSaving)} on next reorder</div>
              </div>
            )}
          </div>

          {/* Price comparison cards */}
          {priceData.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 14, padding: "32px", textAlign: "center", color: "#94a3b8", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No suppliers carry this medicine yet</div>
            </div>
          ) : (
            priceData.map((sup, i) => (
              <div key={sup.id} style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${i === 0 ? "#10b981" : "#e2e8f0"}`, padding: "20px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16, boxShadow: i === 0 ? "0 4px 16px #10b98115" : "0 1px 3px #0000000a", position: "relative", overflow: "hidden" }}>
                {i === 0 && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#10b981,#059669)" }} />}
                {i === 0 && <div style={{ position: "absolute", top: 10, right: 14, fontSize: 10, fontWeight: 800, color: "#10b981", background: "#f0fdf4", padding: "2px 8px", borderRadius: 99, border: "1px solid #bbf7d0" }}>BEST PRICE</div>}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: SLATE }}>{sup.name}</div>
                    {sup.verified && <span style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", background: "#eff6ff", padding: "2px 7px", borderRadius: 99 }}>✓ Verified</span>}
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b" }}>
                    <span>📍 {sup.city}, {sup.country}</span>
                    <span>🚚 {sup.leadDays}d delivery</span>
                    <span>⭐ {sup.rating} ({sup.reviews} reviews)</span>
                    <span>Min order: {sup.moq} units</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: sup.stock === "In stock" ? "#f0fdf4" : "#fffbeb", color: sup.stock === "In stock" ? "#047857" : "#b45309" }}>{sup.stock}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: i === 0 ? GREEN : SLATE }}>{fmt(sup.price)}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>per {selectedMed.unit.replace(/s$/, "")}</div>
                  {parseFloat(sup.saving) > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", marginTop: 2 }}>Save {sup.saving}%</div>}
                  {parseFloat(sup.saving) < 0 && <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", marginTop: 2 }}>{Math.abs(sup.saving)}% more expensive</div>}
                </div>
                <button onClick={() => { setOrderModal(sup); setOrderQty(calcSuggestedOrderQty({ moq: sup.moq, desiredUnits: selectedMed.maxStock - selectedMed.stock })); }} style={{ padding: "10px 18px", borderRadius: 9, background: i === 0 ? GREEN : "#f8fafc", color: i === 0 ? "#fff" : "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, border: i === 0 ? "none" : "1.5px solid #e2e8f0", whiteSpace: "nowrap" }}>
                  Order Now
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* SUPPLIERS TAB */}
      {view === "suppliers" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
          {(suppliersQ.data ?? SUPPLIER_DATA).map((s, i) => (
            <div key={s.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "22px", boxShadow: "0 1px 3px #0000000a", animation: `fadeUp 0.3s ${i * 0.06}s both` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: SLATE }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {s.city}, {s.country}
                  </div>
                </div>
                {s.verified && <span style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", background: "#eff6ff", padding: "3px 8px", borderRadius: 99 }}>✓ Verified</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {[{ l: "Rating", v: `⭐ ${s.rating}`, c: "#f59e0b" }, { l: "On-Time Rate", v: `${s.onTimeRate}%`, c: s.onTimeRate >= 95 ? GREEN : "#f97316" }, { l: "Lead Time", v: `${s.leadDays} days`, c: "#3b82f6" }, { l: "Min Order", v: fmt(s.minOrder, 0), c: "#8b5cf6" }].map((stat, j) => (
                  <div key={j} style={{ background: "#f8fafc", borderRadius: 9, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>{stat.l}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: stat.c }}>{stat.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                <div>
                  <strong>Payment:</strong> {s.paymentTerms} · <strong>Returns:</strong> {s.returnPolicy}
                </div>
                <div style={{ marginTop: 4 }}>
                  <strong>Delivers to:</strong> {s.deliveryZones.join(", ")}
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Catalogue</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Catalogue sync is shown in Price Compare for the selected product.</div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={() => onShowToast(`WhatsApp opened for ${s.name}`, "success")} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  WhatsApp
                </button>
                <button onClick={() => setView("compare")} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  Compare Prices
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ORDERS TAB */}
      {view === "orders" && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #e2e8f0", fontSize: 14, fontWeight: 800, color: SLATE }}>Order History</div>
          {(ordersQ.data ?? []).map((o, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 22px", borderBottom: "1px solid #f8fafc" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: SLATE }}>Purchase order</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                    {o.supplier_id} · {String(o.ordered_at ?? "").split("T")[0]}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: SLATE }}>{fmt(o.total, 0)}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: "#f0fdf4", padding: "2px 8px", borderRadius: 99 }}>✓ Saved</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Order Modal */}
      <Modal open={!!orderModal} onClose={() => setOrderModal(null)}>
        {orderModal && (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Place Order</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 18 }}>
              {orderModal.name} · {selectedMed.name}
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 11, padding: 16, marginBottom: 16, border: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["Unit Price", fmt(orderModal.price)], ["Lead Time", `${orderModal.leadDays} days`], ["Min Order", `${orderModal.moq} units`], ["Payment", orderModal.paymentTerms]].map(([l, v], i) => (
                <div key={i}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: SLATE }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Order Quantity (min {orderModal.moq})</label>
              <input type="number" value={orderQty} onChange={(e) => setOrderQty(clampOrderQtyToMoq(orderModal.moq, parseInt(e.target.value) || orderModal.moq))} style={{ width: "100%", padding: "11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 20, fontWeight: 800, textAlign: "center", fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ background: "#f0fdf4", borderRadius: 9, padding: "12px 14px", marginBottom: 18, border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#065f46" }}>Total: {fmt(calcOrderTotal(orderModal.price, orderQty))}</div>
              <div style={{ fontSize: 11, color: "#047857", marginTop: 2 }}>
                vs {fmt(calcOrderTotal(selectedMed.unitCost, orderQty))} at current price · You save {fmt(calcOrderSavings(selectedMed.unitCost, orderModal.price, orderQty))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setOrderModal(null)} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await createOrderM.mutateAsync({
                      supplierId: orderModal.id,
                      whatsappMessage: "Order sent via WhatsApp (demo)",
                      total: calcOrderTotal(orderModal.price, orderQty),
                      items: [{ productId: String(selectedMed.id), name: selectedMed.name, qty: orderQty, unitPrice: orderModal.price }]
                    });
                    onShowToast(`Order of ${orderQty} units sent to ${orderModal.name} ✓`, "success");
                    setOrderModal(null);
                  } catch (e) {
                    onShowToast("Order failed — please try again", "info");
                  }
                }}
                style={{ flex: 2, padding: "11px", borderRadius: 9, border: "none", background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
              >
                Send Order via WhatsApp
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

