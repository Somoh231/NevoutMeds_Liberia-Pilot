import { useMemo, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { fmtDate, fmtMonthYear, timeAgo } from "@/platform/utils/dates";
import { STATUS, NEEDS_ATTENTION } from "@/platform/utils/inventoryStatus";
import AdjustStockDialog from "@/platform/features/inventory/AdjustStockDialog";
import { EXPIRY_LABEL, toProductView } from "@/platform/features/inventory/model";
import ReorderDialog from "@/platform/features/procurement/ReorderDialog";
import { useStockMovements } from "@/platform/data/useStockMovements";
import { useLayout } from "@/platform/shell/useBreakpoint";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Chip,
  Dialog,
  Drawer,
  EmptyState,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  SearchInput,
  Select,
  SkeletonBlock
} from "@/platform/ui";
import { Package, Plus, Truck } from "@/platform/ui/icons";

// Fixed actions width: every row shares one grid, so columns line up down the list.
const COLS = "minmax(200px, 2.2fr) 120px minmax(150px, 1.2fr) 110px 100px 100px 172px";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "out", label: "Out of stock" },
  { id: "critical", label: "Critical" },
  { id: "low", label: "Low" },
  { id: "expiring", label: "Expiring ≤30 days" },
  { id: "overstock", label: "Overstock" },
  { id: "untracked", label: "No levels set" }
];

const SORTS = {
  priority: { label: "Needs attention first", fn: (a, b) => STATUS[a.status].priority - STATUS[b.status].priority || a.name.localeCompare(b.name) },
  name: { label: "Name (A–Z)", fn: (a, b) => a.name.localeCompare(b.name) },
  stock: { label: "Lowest stock", fn: (a, b) => a.stock - b.stock },
  days: { label: "Fewest days left", fn: (a, b) => (a.daysOfStock ?? 1e9) - (b.daysOfStock ?? 1e9) },
  expiry: { label: "Expiring soonest", fn: (a, b) => a.expiryDays - b.expiryDays },
  value: { label: "Most value in stock", fn: (a, b) => b.valueAtCost - a.valueAtCost }
};

const EMPTY_FORM = { name: "", brand: "", category: "", unit: "tablets", stock: "", unitCost: "", sellingPrice: "", reorderPoint: "", maxStock: "", dailyVelocity: "", batchId: "", expiryDate: "", requiresPrescription: false };

function meterColour(p) {
  if (p.status === "out" || p.status === "critical") return "var(--nv-danger)";
  if (p.status === "low" || p.status === "expiring") return "var(--nv-warning)";
  if (p.status === "untracked") return "var(--nv-text-muted)";
  return "var(--nv-brand)";
}

function StockMeter({ p }) {
  const top = Math.max(p.maxStock, p.reorderPoint * 2, p.stock, 1);
  return (
    <div className="nv-meter" style={{ "--meter": meterColour(p) }} aria-hidden="true">
      <i style={{ width: `${Math.min(100, (p.stock / top) * 100)}%` }} />
      {p.reorderPoint > 0 && <b style={{ left: `${Math.min(100, (p.reorderPoint / top) * 100)}%` }} />}
    </div>
  );
}

const daysText = (p) => (p.daysOfStock === null ? "No sales rate" : p.daysOfStock > 365 ? "365+ days" : `${p.daysOfStock} day${p.daysOfStock === 1 ? "" : "s"} left`);
// One format for every row: the month the batch expires, with a countdown under it when it is close.
const expiryText = (p) => (p.expiry === "none" ? "No date" : p.expiry === "expired" ? "Expired" : fmtMonthYear(p.expiryDate));
const expiryNote = (p) => (p.expiry === "expired" ? fmtDate(p.expiryDate) : p.expiry !== "none" && p.expiryDays <= 90 ? `in ${p.expiryDays} day${p.expiryDays === 1 ? "" : "s"}` : null);

export default function InventoryScreen({ medicines, setMedicines, onShowToast, onAdjustStock, onCreateProduct, dataStatus, onNavigate, initialFilter, initialQuery }) {
  const layout = useLayout();
  const [search, setSearch] = useState(initialQuery ?? "");
  const [filter, setFilter] = useState(initialFilter ?? "all");
  const [sort, setSort] = useState("priority");
  const [detailId, setDetailId] = useState(null);
  const [reorderItem, setReorderItem] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addErrors, setAddErrors] = useState({});
  const [savingProduct, setSavingProduct] = useState(false);

  const products = useMemo(() => medicines.map(toProductView), [medicines]);
  const counts = useMemo(() => {
    const c = { all: products.length, attention: 0 };
    for (const p of products) {
      c[p.status] = (c[p.status] ?? 0) + 1;
      if (NEEDS_ATTENTION.includes(p.status)) c.attention++;
    }
    return c;
  }, [products]);
  const totalValue = products.reduce((s, p) => s + p.valueAtCost, 0);

  const q = search.trim().toLowerCase();
  const visible = products
    .filter((p) => !q || [p.name, p.brand, p.category, p.batchId].some((v) => v && v.toLowerCase().includes(q)))
    .filter((p) => filter === "all" || (filter === "attention" ? p.needsAttention : p.status === filter))
    .sort(SORTS[sort].fn);
  const detail = products.find((p) => p.id === detailId) ?? null;

  const openAdjust = (p) => {
    setDetailId(null);
    setAdjustItem(p);
  };

  const validateProduct = () => {
    const e = {};
    if (!addForm.name.trim()) e.name = "Enter the product name.";
    if (!addForm.category.trim()) e.category = "Enter a category, e.g. Analgesic.";
    if (!(Number(addForm.sellingPrice) > 0)) e.sellingPrice = "Enter the selling price.";
    if (Number(addForm.unitCost) < 0) e.unitCost = "Cost cannot be negative.";
    if (addForm.maxStock !== "" && addForm.reorderPoint !== "" && Number(addForm.maxStock) > 0 && Number(addForm.maxStock) < Number(addForm.reorderPoint))
      e.maxStock = "Maximum stock should be above the reorder point.";
    return e;
  };

  const commitAddProduct = async (e) => {
    e.preventDefault();
    const errs = validateProduct();
    setAddErrors(errs);
    if (Object.keys(errs).length) return;
    const input = {
      name: addForm.name.trim(),
      brand: addForm.brand.trim() || null,
      category: addForm.category.trim(),
      unit: addForm.unit.trim() || null,
      stock: Math.max(0, Number(addForm.stock) || 0),
      unitCost: Math.max(0, Number(addForm.unitCost) || 0),
      sellingPrice: Math.max(0, Number(addForm.sellingPrice) || 0),
      reorderPoint: Math.max(0, Number(addForm.reorderPoint) || 0),
      maxStock: Math.max(0, Number(addForm.maxStock) || 0),
      dailyVelocity: Math.max(0, Number(addForm.dailyVelocity) || 0),
      batchId: addForm.batchId.trim() || null,
      expiryDate: addForm.expiryDate || null,
      isEssential: true,
      requiresPrescription: !!addForm.requiresPrescription
    };
    // Persist first; the product only appears once the database accepted it.
    let savedId = `tmp-${Date.now()}`;
    let queued = false;
    if (typeof onCreateProduct === "function") {
      setSavingProduct(true);
      try {
        const res = await onCreateProduct(input);
        if (res?.productId) savedId = res.productId;
        queued = res?.status === "queued";
      } catch (err) {
        onShowToast(err?.message || "Failed to save product — nothing was added", "error");
        setSavingProduct(false);
        return;
      }
      setSavingProduct(false);
    }
    setMedicines((prev) => [{ ...input, id: savedId, brand: input.brand || "", unit: input.unit || "", batchId: input.batchId || "", supplierId: null, movements: [], pendingSync: queued }, ...prev]);
    setAddOpen(false);
    setAddForm(EMPTY_FORM);
    onShowToast(queued ? `${input.name} saved on this device — will sync when you are back online` : `${input.name} added`, queued ? "info" : "success");
  };

  const f = (k) => ({ value: addForm[k], onChange: (e) => setAddForm((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <div className="nv-page">
      <PageHeader
        title="Stock on hand"
        description={
          dataStatus?.firstLoad
            ? "Loading stock…"
            : `${products.length} product${products.length === 1 ? "" : "s"} · ${counts.attention} need attention · ${fmt(totalValue, 0)} at cost`
        }
        actions={
          <Button variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => { setAddErrors({}); setAddOpen(true); }}>
            Add product
          </Button>
        }
      />
      {dataStatus?.error && <Alert tone="warning" className="nv-gap-below">Couldn’t refresh stock. Showing what this device last saw.</Alert>}

      <FilterBar
        search={<SearchInput label="Search products" placeholder="Name, brand, category or batch" value={search} onChange={(e) => setSearch(e.target.value)} />}
        actions={
          <div style={{ minWidth: 200 }}>
            <label className="nv-visually-hidden" htmlFor="inv-sort">Sort by</label>
            <Select id="inv-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([id, s]) => (
                <option key={id} value={id}>{s.label}</option>
              ))}
            </Select>
          </div>
        }
      >
        {FILTERS.filter((x) => x.id === "all" || x.id === "attention" || counts[x.id] > 0).map((x) => (
          <Chip key={x.id} pressed={filter === x.id} onClick={() => setFilter(x.id)}>
            {x.label}
            <span className="nv-num" aria-label={`, ${counts[x.id] ?? 0} products`}>{counts[x.id] ?? 0}</span>
          </Chip>
        ))}
      </FilterBar>

      {dataStatus?.firstLoad && products.length === 0 ? (
        <div className="nv-card"><SkeletonBlock label="Loading stock…" lines={5} /></div>
      ) : products.length === 0 ? (
        <div className="nv-card">
          <EmptyState icon={<Package size={26} />} title="No products yet" actions={<Button variant="primary" onClick={() => setAddOpen(true)}>Add your first product</Button>}>
            Add products one by one, or import your stock list from a spreadsheet (Import data, in the account menu).
          </EmptyState>
        </div>
      ) : visible.length === 0 ? (
        <div className="nv-card">
          <EmptyState title="Nothing matches">
            No products match {q ? `“${search}”` : "this filter"}. <button type="button" className="nv-link" style={{ background: "none", border: 0, padding: 0, minHeight: 0, cursor: "pointer" }} onClick={() => { setSearch(""); setFilter("all"); }}>Show all products</button>
          </EmptyState>
        </div>
      ) : (
        <div className="nv-rows" role="list" aria-label="Products" style={{ "--cols": COLS }}>
          <div className="nv-rows__head" aria-hidden="true">
            <span>Product</span><span>Status</span><span>Stock</span><span>Days of stock</span><span>Expiry</span><span>Value</span><span style={{ textAlign: "right" }}>Actions</span>
          </div>
          {visible.map((p) => {
            const st = STATUS[p.status];
            return (
              <div key={p.id} role="listitem" className={`nv-row${p.needsAttention ? " nv-row--attention" : ""}`} style={{ "--row-accent": st.color }}>
                <button type="button" className="nv-row__main" onClick={() => setDetailId(p.id)} aria-label={`${p.name}, ${st.label}, ${p.stock} ${p.unit}. Open details`}>
                  <span className="nv-row__title">{p.name}</span>
                  <span className="nv-row__sub">
                    {[p.brand, p.category].filter(Boolean).join(" · ")}
                    {p.requiresPrescription ? " · Rx" : ""}
                  </span>
                </button>
                <div className="nv-row__side" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {p.pendingSync && <Badge tone="pending">Pending sync</Badge>}
                </div>
                <div className="nv-row__meta">
                  <strong className="nv-figure">{p.stock}</strong> <span className="nv-unit">{p.unit}</span> · {daysText(p)}
                  {p.expiry !== "none" && p.expiry !== "later" ? ` · ${p.expiry === "expired" ? "expired" : `expires ${fmtDate(p.expiryDate)}`}` : ""}
                  <StockMeter p={p} />
                </div>
                <div className="nv-row__cell">
                  <span className="nv-figure">{p.stock}</span> <span className="nv-unit">{p.unit}</span>
                  <small>{p.reorderPoint > 0 ? `reorder at ${p.reorderPoint}${p.maxStock > 0 ? ` · max ${p.maxStock}` : ""}` : "no reorder level"}</small>
                  <StockMeter p={p} />
                </div>
                <div className="nv-row__cell">
                  {daysText(p)}
                  <small>{p.dailyVelocity > 0 ? `${p.dailyVelocity}/day` : "rate not set"}</small>
                </div>
                <div className="nv-row__cell" style={{ color: p.expiry === "expired" || p.expiry === "urgent" ? "var(--nv-danger)" : p.expiry === "d30" ? "var(--nv-warning)" : undefined }}>
                  {expiryText(p)}
                  <small>{[expiryNote(p), p.batchId && `batch ${p.batchId}`].filter(Boolean).join(" · ") || "\u00a0"}</small>
                </div>
                <div className="nv-row__cell nv-num">{fmt(p.valueAtCost, 0)}<small>at cost</small></div>
                <div className="nv-row__actions">
                  {p.suggestedReorder > 0 && (
                    <Button size="sm" onClick={() => setReorderItem(p)} aria-label={`Reorder ${p.name}`}>
                      Reorder
                    </Button>
                  )}
                  <Button size="sm" onClick={() => openAdjust(p)} aria-label={`Adjust stock for ${p.name}`}>
                    Adjust
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product detail */}
      <Drawer open={!!detail} onClose={() => setDetailId(null)} title={detail?.name ?? "Product"} side={layout === "phone" ? "bottom" : "right"}>
        {detail && <ProductDetail p={detail} onAdjust={() => openAdjust(detail)} onReorder={() => { setDetailId(null); setReorderItem(detail); }} />}
      </Drawer>

      {/* Adjust stock */}
      <AdjustStockDialog item={adjustItem} onClose={() => setAdjustItem(null)} onAdjustStock={onAdjustStock} setMedicines={setMedicines} onShowToast={onShowToast} />

      {/* Add product */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add product" description="Only the name, category and selling price are required." width={620}>
        <form className="nv-stack" onSubmit={commitAddProduct} noValidate>
          <FormField label="Product name" required error={addErrors.name}><Input {...f("name")} autoComplete="off" /></FormField>
          <div className="nv-grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}>
            <FormField label="Brand"><Input {...f("brand")} /></FormField>
            <FormField label="Category" required error={addErrors.category}><Input {...f("category")} placeholder="e.g. Analgesic" /></FormField>
            <FormField label="Unit"><Input {...f("unit")} placeholder="tablets, bottles…" /></FormField>
            <FormField label="Stock now"><Input type="number" inputMode="numeric" min={0} {...f("stock")} /></FormField>
            <FormField label="Unit cost" error={addErrors.unitCost}><Input type="number" inputMode="decimal" min={0} step="0.01" {...f("unitCost")} /></FormField>
            <FormField label="Selling price" required error={addErrors.sellingPrice}><Input type="number" inputMode="decimal" min={0} step="0.01" {...f("sellingPrice")} /></FormField>
            <FormField label="Reorder when stock reaches" hint="Drives low-stock alerts."><Input type="number" inputMode="numeric" min={0} {...f("reorderPoint")} /></FormField>
            <FormField label="Maximum stock" error={addErrors.maxStock} hint="Used for suggested reorder quantities."><Input type="number" inputMode="numeric" min={0} {...f("maxStock")} /></FormField>
            <FormField label="Sold per day (average)" hint="Used for days-of-stock."><Input type="number" inputMode="decimal" min={0} step="0.1" {...f("dailyVelocity")} /></FormField>
            <FormField label="Batch"><Input {...f("batchId")} /></FormField>
            <FormField label="Expiry date"><Input type="date" {...f("expiryDate")} /></FormField>
          </div>
          <Checkbox label="Prescription-only medicine" checked={addForm.requiresPrescription} onChange={(e) => setAddForm((p) => ({ ...p, requiresPrescription: e.target.checked }))} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={savingProduct}>Save product</Button>
          </div>
        </form>
      </Dialog>

      <ReorderDialog
        product={reorderItem}
        onClose={() => setReorderItem(null)}
        onShowToast={onShowToast}
        onCompare={onNavigate ? (id) => { setReorderItem(null); onNavigate("suppliers", { compareProductId: id }); } : undefined}
      />
    </div>
  );
}

function ProductDetail({ p, onAdjust, onReorder }) {
  const moves = useStockMovements(p.id);
  const st = STATUS[p.status];
  return (
    <div className="nv-stack">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge tone={st.tone}>{st.label}</Badge>
        {p.requiresPrescription && <Badge tone="info">Prescription only</Badge>}
        {p.pendingSync && <Badge tone="pending">Pending sync</Badge>}
      </div>
      <dl className="nv-kv" style={{ margin: 0 }}>
        <div><dt>In stock</dt><dd>{p.stock} {p.unit}</dd></div>
        <div><dt>Days of stock</dt><dd>{p.daysOfStock === null ? "—" : p.daysOfStock}<small>{p.dailyVelocity > 0 ? `at ${p.dailyVelocity} sold per day` : "no sales rate recorded"}</small></dd></div>
        <div><dt>Reorder at</dt><dd>{p.reorderPoint || "—"}<small>{p.maxStock > 0 ? `max ${p.maxStock}` : "no maximum set"}</small></dd></div>
        <div><dt>Suggested reorder</dt><dd>{p.suggestedReorder > 0 ? `${p.suggestedReorder}` : "—"}<small>{p.suggestedReorder > 0 ? `${fmt(p.suggestedReorderCost)} at cost` : "not needed now"}</small></dd></div>
        <div><dt>Value in stock</dt><dd>{fmt(p.valueAtCost)}<small>{fmt(p.valueAtRetail)} at selling price</small></dd></div>
        <div><dt>Expiry</dt><dd>{p.expiryDate ? fmtDate(p.expiryDate) : "—"}<small>{EXPIRY_LABEL[p.expiry]}{p.batchId ? ` · batch ${p.batchId}` : ""}</small></dd></div>
        <div><dt>Unit cost / price</dt><dd>{fmt(p.unitCost)} / {fmt(p.sellingPrice)}<small>{p.sellingPrice > 0 ? `${Math.round(((p.sellingPrice - p.unitCost) / p.sellingPrice) * 100)}% margin` : "no price set"}</small></dd></div>
      </dl>
      {p.valueAtRiskAtExpiry > 0 && (
        <Alert tone="warning" title="Stock may expire before it sells">
          About {p.unitsAtRiskAtExpiry} {p.unit} ({fmt(p.valueAtRiskAtExpiry)} at cost) at the recorded sales rate. Dispense this batch first.
        </Alert>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={onAdjust}>Adjust stock</Button>
        <Button variant={p.suggestedReorder > 0 ? "primary" : "secondary"} icon={<Truck size={18} aria-hidden="true" />} onClick={onReorder}>Reorder</Button>
      </div>
      <section aria-labelledby="moves-h">
        <h3 id="moves-h" className="nv-section-header__title" style={{ marginBottom: 8 }}>Stock history</h3>
        {moves.isLoading ? (
          <SkeletonBlock label="Loading stock history" lines={3} />
        ) : moves.isError ? (
          <p className="nv-hint">Stock history needs a connection. It will load when you are back online.</p>
        ) : (moves.data ?? []).length === 0 ? (
          <p className="nv-hint">No stock movements recorded yet.</p>
        ) : (
          <ul className="nv-timeline">
            {moves.data.map((m) => (
              <li key={m.id}>
                <span>
                  <span className={m.delta >= 0 ? "nv-delta-up" : "nv-delta-down"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>{" "}
                  {m.note || (m.delta < 0 ? "Sold or removed" : "Added")}
                </span>
                <span className="nv-hint" style={{ whiteSpace: "nowrap" }}>{timeAgo(m.occurredAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
