import { useState } from "react";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { SUPPLIER_DATA } from "@/platform/seed/suppliers";
import { daysUntilExpiry, daysUntilStockout } from "@/platform/utils/dates";
import { fmt } from "@/platform/utils/format";
import { getStockStatus, STATUS } from "@/platform/utils/inventoryStatus";
import { Badge, Modal, Sparkline, StockBar } from "@/platform/components/primitives";
import { adjustedStockLevel, applyInventoryAdjustment } from "@/platform/features/inventory/adjustments";
import { computeReorderCost, computeReorderQty } from "@/platform/features/inventory/reorder";
import { buildReorderWhatsappPreview } from "@/platform/features/suppliers/whatsapp";

export default function InventoryScreen({ medicines, setMedicines, onShowToast, onAdjustStock, onCreateProduct, dataStatus }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("priority");
  const [adjustItem, setAdjustItem] = useState(null);
  const [reorderItem, setReorderItem] = useState(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustNote, setAdjustNote] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    brand: "",
    category: "Other",
    unit: "tablets",
    stock: 0,
    unitCost: 0,
    sellingPrice: 0,
    reorderPoint: 10,
    maxStock: 100,
    dailyVelocity: 1,
    batchId: "",
    expiryDate: ""
  });

  const enriched = medicines.map((m) => ({
    ...m,
    status: getStockStatus(m),
    expDays: daysUntilExpiry(m.expiryDate),
    stockDays: daysUntilStockout(m.stock, m.dailyVelocity)
  }));
  const alerts = enriched.filter((m) => ["critical", "low", "expiring"].includes(m.status));
  const filtered = enriched
    .filter((m) => {
      const q = search.toLowerCase();
      return (
        (!q || m.name.toLowerCase().includes(q) || m.brand.toLowerCase().includes(q)) &&
        (filter === "all" || m.status === filter || (filter === "alerts" && ["critical", "low", "expiring"].includes(m.status)))
      );
    })
    .sort((a, b) =>
      sort === "priority" ? STATUS[a.status].priority - STATUS[b.status].priority : sort === "name" ? a.name.localeCompare(b.name) : sort === "stock" ? a.stock - b.stock : a.expDays - b.expDays
    );

  const commitAdjust = async () => {
    // Optimistic UI update (keeps current UX intact)
    setMedicines((prev) => applyInventoryAdjustment(prev, adjustItem.id, adjustQty));
    onShowToast(`${adjustItem.name} updated — now ${adjustedStockLevel(adjustItem.stock, adjustQty)} units`, "success");
    setAdjustItem(null);
    // If platform provides a real persistence hook, call it.
    if (typeof onAdjustStock === "function") {
      try {
        await onAdjustStock({ productId: adjustItem.id, delta: adjustQty, note: adjustNote || undefined });
      } catch (e) {
        onShowToast("Sync failed — will retry on refresh", "info");
      }
    }
  };

  const commitAddProduct = async () => {
    const name = addForm.name.trim();
    const category = addForm.category.trim();
    if (!name) return onShowToast("Product name is required", "info");
    if (!category) return onShowToast("Category is required", "info");
    if (Number(addForm.sellingPrice) <= 0) return onShowToast("Selling price must be > 0", "info");
    if (Number(addForm.unitCost) < 0) return onShowToast("Unit cost cannot be negative", "info");

    const prev = medicines;
    const nextId = typeof prev[0]?.id === "number" ? Math.max(0, ...prev.map((m) => Number(m.id) || 0)) + 1 : `tmp-${Date.now()}`;
    const optimistic = {
      id: nextId,
      name,
      brand: addForm.brand.trim() || "",
      category,
      stock: Math.max(0, Number(addForm.stock) || 0),
      reorderPoint: Math.max(0, Number(addForm.reorderPoint) || 0),
      maxStock: Math.max(0, Number(addForm.maxStock) || 0),
      dailyVelocity: Math.max(0, Number(addForm.dailyVelocity) || 0),
      unitCost: Math.max(0, Number(addForm.unitCost) || 0),
      sellingPrice: Math.max(0, Number(addForm.sellingPrice) || 0),
      unit: addForm.unit.trim() || "",
      batchId: addForm.batchId.trim() || "",
      expiryDate: addForm.expiryDate || "2099-12-31",
      supplierId: null,
      isEssential: true,
      requiresPrescription: false,
      movements: [0, 0, 0, 0, 0, 0, 0]
    };

    // immediate UI update
    setMedicines((p) => [optimistic, ...p]);
    setAddOpen(false);
    onShowToast(`${name} added`, "success");

    // persist if provided (Supabase mode). If it fails, rollback and show toast.
    try {
      if (typeof onCreateProduct === "function") {
        await onCreateProduct({
          name,
          brand: addForm.brand.trim() || null,
          category,
          unit: addForm.unit.trim() || null,
          stock: Number(addForm.stock) || 0,
          unitCost: Number(addForm.unitCost) || 0,
          sellingPrice: Number(addForm.sellingPrice) || 0,
          reorderPoint: Number(addForm.reorderPoint) || 0,
          maxStock: Number(addForm.maxStock) || 0,
          dailyVelocity: Number(addForm.dailyVelocity) || 0,
          batchId: addForm.batchId.trim() || null,
          expiryDate: addForm.expiryDate || null,
          isEssential: true,
          requiresPrescription: false
        });
      }
    } catch (e) {
      setMedicines((p) => p.filter((m) => String(m.id) !== String(optimistic.id)));
      onShowToast("Failed to save product — please try again", "info");
    }

    setAddForm({
      name: "",
      brand: "",
      category: "Other",
      unit: "tablets",
      stock: 0,
      unitCost: 0,
      sellingPrice: 0,
      reorderPoint: 10,
      maxStock: 100,
      dailyVelocity: 1,
      batchId: "",
      expiryDate: ""
    });
  };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Smart Inventory</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>
            {medicines.length} products · {alerts.length} need attention
          </span>
          {dataStatus?.loading && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>Syncing…</span>}
          {dataStatus?.error && <span style={{ fontSize: 12, color: "#f97316", fontWeight: 800 }}>Using cached data</span>}
        </div>
      </div>
      {alerts.length > 0 && (
        <div style={{ background: "linear-gradient(135deg,#fef2f2,#fff7ed)", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 0 3px #fecaca", animation: "pulse 2s infinite", flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#7f1d1d" }}>
            {alerts.filter((a) => a.status === "critical").length} critical · {alerts.filter((a) => a.status === "low").length} low stock · {alerts.filter((a) => a.status === "expiring").length} expiring
          </div>
          <button onClick={() => setFilter("alerts")} style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Filter
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 160, position: "relative" }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} width="13" height="13" fill="none" stroke="#334155" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicines…" style={{ width: "100%", padding: "9px 12px 9px 30px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box", background: "#fff" }} />
        </div>
        {["all", "alerts", "critical", "low", "expiring", "healthy"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: `1.5px solid ${filter === f ? "#10b981" : "#e2e8f0"}`,
              background: filter === f ? "#f0fdf4" : "#fff",
              color: filter === f ? "#047857" : "#64748b",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT,
              whiteSpace: "nowrap"
            }}
          >
            {f === "all" ? "All" : f === "alerts" ? `⚠ (${alerts.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "7px 11px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 12, fontFamily: FONT, color: "#64748b", outline: "none" }}>
          <option value="priority">Priority</option>
          <option value="name">Name</option>
          <option value="stock">Stock</option>
          <option value="expiry">Expiry</option>
        </select>
        <button onClick={() => setAddOpen(true)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: GREEN, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>+ Add Product</button>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 1.3fr 0.8fr 0.7fr 0.9fr auto", padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", alignItems: "center", gap: 6 }}>
          <span>Medicine</span>
          <span>Status</span>
          <span>Stock</span>
          <span>Days Left</span>
          <span>Velocity</span>
          <span>Expiry</span>
          <span>Action</span>
        </div>
        {filtered.map((item, idx) => {
          const sc = STATUS[item.status];
          return (
            <div
              key={item.id}
              style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 1.3fr 0.8fr 0.7fr 0.9fr auto", padding: "12px 18px", borderBottom: "1px solid #f8fafc", alignItems: "center", gap: 6, animation: `fadeUp 0.3s ${idx * 0.03}s both` }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: SLATE, display: "flex", alignItems: "center", gap: 6 }}>
                  {item.isEssential && <span style={{ width: 5, height: 5, borderRadius: "50%", background: GREEN, flexShrink: 0 }} />}
                  {item.name}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                  {item.brand} · {item.category}
                </div>
              </div>
              <div>
                <Badge status={item.status} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 900, color: sc.color }}>{item.stock}</span>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>{item.unit}</span>
                </div>
                <StockBar stock={item.stock} reorderPoint={item.reorderPoint} maxStock={item.maxStock} status={item.status} />
                <div style={{ fontSize: 9, color: "#cbd5e1", marginTop: 2 }}>reorder @ {item.reorderPoint}</div>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: item.stockDays <= 3 ? "#ef4444" : item.stockDays <= 7 ? "#f97316" : GREEN }}>{item.stockDays > 90 ? "90+" : item.stockDays}d</div>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>to stockout</div>
              </div>
              <div>
                <Sparkline data={item.movements.map(Math.abs)} color={sc.color} h={26} w={54} />
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 1 }}>{item.dailyVelocity}/day</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: item.expDays <= 14 ? "#f59e0b" : item.expDays <= 30 ? "#f97316" : "#64748b" }}>
                  {item.expDays <= 0 ? "EXPIRED" : item.expDays <= 30 ? `${item.expDays}d` : new Date(item.expiryDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                </div>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>{item.batchId}</div>
              </div>
              <div style={{ display: "flex", gap: 5 }} onClick={(e) => e.stopPropagation()}>
                {["critical", "low"].includes(item.status) && (
                  <button onClick={() => setReorderItem(item)} style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: item.status === "critical" ? "#ef4444" : "#f97316", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                    Reorder
                  </button>
                )}
                <button onClick={() => { setAdjustItem(item); setAdjustQty(0); setAdjustNote(""); }} style={{ width: 28, height: 28, borderRadius: 7, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 12 }}>
                  ✎
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Modal open={!!adjustItem} onClose={() => setAdjustItem(null)}>
        {adjustItem && (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Adjust Stock</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 18 }}>
              {adjustItem.name} · {adjustItem.stock} {adjustItem.unit} currently
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, marginBottom: 12 }}>
              {[-10, -5, -1, +1, +5, +10].map((v) => (
                <button key={v} onClick={() => setAdjustQty(v)} style={{ padding: "9px 0", borderRadius: 7, border: `1.5px solid ${adjustQty === v ? "#10b981" : "#e2e8f0"}`, background: adjustQty === v ? "#f0fdf4" : "#f8fafc", color: adjustQty === v ? "#047857" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  {v > 0 ? `+${v}` : v}
                </button>
              ))}
            </div>
            <input type="number" value={adjustQty} onChange={(e) => setAdjustQty(parseInt(e.target.value) || 0)} style={{ width: "100%", padding: "11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 20, fontWeight: 800, textAlign: "center", fontFamily: FONT, outline: "none", marginBottom: 12, boxSizing: "border-box" }} />
            <div style={{ padding: "11px 13px", borderRadius: 9, background: adjustQty >= 0 ? "#f0fdf4" : "#fff7ed", border: `1px solid ${adjustQty >= 0 ? "#bbf7d0" : "#fed7aa"}`, marginBottom: 12, fontSize: 13, fontWeight: 600, color: adjustQty >= 0 ? "#065f46" : "#9a3412" }}>
              New level: <strong>{adjustedStockLevel(adjustItem.stock, adjustQty)} {adjustItem.unit}</strong>
            </div>
            <textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Note: shipment received, stock count, expired removed…" style={{ width: "100%", padding: "9px 11px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 12, fontFamily: FONT, height: 56, resize: "none", outline: "none", marginBottom: 16, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setAdjustItem(null)} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                Cancel
              </button>
              <button onClick={commitAdjust} style={{ flex: 2, padding: "11px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                Confirm Update
              </button>
            </div>
          </>
        )}
      </Modal>
      <Modal open={!!reorderItem} onClose={() => setReorderItem(null)}>
        {reorderItem &&
          (() => {
            const qty = computeReorderQty(reorderItem),
              cost = computeReorderCost(qty, reorderItem.unitCost),
              sup = SUPPLIER_DATA.find((s) => s.id === reorderItem.supplierId);
            return (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Reorder {reorderItem.name}</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 18 }}>via WhatsApp to {sup?.name}</div>
                <div style={{ background: "#f8fafc", borderRadius: 11, padding: 16, marginBottom: 16, border: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[["Supplier", sup?.name], ["Lead Time", `${sup?.leadDays} days`], ["Order Qty", `${qty} units`], ["Total Cost", fmt(cost)]].map(([l, v], i) => (
                    <div key={i}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 }}>{l}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: SLATE }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#f0fdf4", borderRadius: 9, padding: "11px 13px", marginBottom: 18, border: "1px solid #bbf7d0", fontSize: 12, color: "#047857", lineHeight: 1.6 }}>
                  <strong>WhatsApp:</strong>
                  <br />
                  <em>{buildReorderWhatsappPreview({ supplierName: sup?.name, qty, medicineName: reorderItem.name, brand: reorderItem.brand, locationLabel: "Monrovia Central" })}</em>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setReorderItem(null)} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                    Cancel
                  </button>
                  <button onClick={() => { onShowToast(`Reorder sent to ${sup?.name} ✓`, "success"); setReorderItem(null); }} style={{ flex: 2, padding: "11px", borderRadius: 9, border: "none", background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                    Send via WhatsApp
                  </button>
                </div>
              </>
            );
          })()}
      </Modal>
      <Modal open={addOpen} onClose={() => setAddOpen(false)} maxW={560}>
        <div style={{ fontSize: 17, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Add Product</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Adds to your inventory immediately. Syncs to Supabase when configured.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Name *</label>
            <input value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Brand</label>
            <input value={addForm.brand} onChange={(e) => setAddForm((p) => ({ ...p, brand: e.target.value }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Category *</label>
            <input value={addForm.category} onChange={(e) => setAddForm((p) => ({ ...p, category: e.target.value }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Unit</label>
            <input value={addForm.unit} onChange={(e) => setAddForm((p) => ({ ...p, unit: e.target.value }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Stock</label>
            <input type="number" min={0} value={addForm.stock} onChange={(e) => setAddForm((p) => ({ ...p, stock: parseInt(e.target.value) || 0 }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Expiry date</label>
            <input type="date" value={addForm.expiryDate} onChange={(e) => setAddForm((p) => ({ ...p, expiryDate: e.target.value }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Unit cost</label>
            <input type="number" min={0} step="0.01" value={addForm.unitCost} onChange={(e) => setAddForm((p) => ({ ...p, unitCost: parseFloat(e.target.value) || 0 }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Selling price *</label>
            <input type="number" min={0} step="0.01" value={addForm.sellingPrice} onChange={(e) => setAddForm((p) => ({ ...p, sellingPrice: parseFloat(e.target.value) || 0 }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Reorder point</label>
            <input type="number" min={0} value={addForm.reorderPoint} onChange={(e) => setAddForm((p) => ({ ...p, reorderPoint: parseInt(e.target.value) || 0 }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Max stock</label>
            <input type="number" min={0} value={addForm.maxStock} onChange={(e) => setAddForm((p) => ({ ...p, maxStock: parseInt(e.target.value) || 0 }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Daily velocity</label>
            <input type="number" min={0} step="0.1" value={addForm.dailyVelocity} onChange={(e) => setAddForm((p) => ({ ...p, dailyVelocity: parseFloat(e.target.value) || 0 }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Batch ID</label>
            <input value={addForm.batchId} onChange={(e) => setAddForm((p) => ({ ...p, batchId: e.target.value }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setAddOpen(false)} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Cancel
          </button>
          <button onClick={commitAddProduct} style={{ flex: 2, padding: "11px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
            Add Product
          </button>
        </div>
      </Modal>
    </div>
  );
}

