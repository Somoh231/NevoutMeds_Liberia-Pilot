import { useMemo, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { fmtDate, timeAgo } from "@/platform/utils/dates";
import { useSuppliers } from "@/platform/data/useSuppliers";
import { useSupplierCatalogue } from "@/platform/data/useSupplierCatalogue";
import { usePurchaseOrders } from "@/platform/data/usePurchaseOrders";
import { useCreateSupplier, useRecordSupplierPrice } from "@/platform/data/useProcurement";
import { useSync } from "@/platform/offline/SyncProvider";
import { useLayout } from "@/platform/shell/useBreakpoint";
import { toProductView } from "@/platform/features/inventory/model";
import PriceCompare from "@/platform/features/procurement/PriceCompare";
import ReorderDialog, { whatsappLink } from "@/platform/features/procurement/ReorderDialog";
import { Alert, Badge, Button, Card, Dialog, Drawer, EmptyState, FormField, Input, PageHeader, Select, SkeletonBlock, Tabs, tabPanelProps } from "@/platform/ui";
import { Plus, Receipt, Truck } from "@/platform/ui/icons";

const PO_STATUS = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Ordered", tone: "info" },
  received: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  pending: { label: "Pending sync", tone: "pending" }
};

export default function SuppliersScreen({ medicines, onShowToast, onNavigate, compareProductId, initialTab }) {
  const layout = useLayout();
  const { online, queue } = useSync();
  const suppliersQ = useSuppliers();
  const catalogueQ = useSupplierCatalogue();
  const ordersQ = usePurchaseOrders();
  const suppliers = suppliersQ.data ?? [];
  const catalogue = catalogueQ.data ?? [];
  const orders = ordersQ.data ?? [];
  const [tab, setTab] = useState(initialTab ?? "compare");
  const [reorder, setReorder] = useState(null); // { product, supplierId, qty }
  const [supplierDetail, setSupplierDetail] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [priceFor, setPriceFor] = useState(null); // { productName?, supplierId? }

  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name ?? "Supplier";
  const pendingOrders = queue.filter((q) => q.mutation_type === "create_purchase_order" && q.status !== "synced");
  const openOrders = orders.filter((o) => o.status === "sent" || o.status === "draft");

  return (
    <div className="nv-page">
      <PageHeader
        title="Suppliers & ordering"
        description={`${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"} · ${catalogue.length} recorded price${catalogue.length === 1 ? "" : "s"} · ${openOrders.length} open order${openOrders.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Button onClick={() => setPriceFor({})} disabled={!online || suppliers.length === 0} title={!online ? "Needs a connection" : undefined}>Record a price</Button>
            <Button variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAddOpen(true)} disabled={!online} title={!online ? "Needs a connection" : undefined}>Add supplier</Button>
          </>
        }
      />
      {!online && <Alert tone="offline" className="nv-gap-below">Offline: you can compare recorded prices and create orders (saved on this device). Adding suppliers and recording prices need a connection.</Alert>}

      <div style={{ marginBottom: 16 }}>
        <Tabs
          idBase="sup"
          label="Suppliers sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "compare", label: "Price compare" },
            { id: "suppliers", label: `Suppliers (${suppliers.length})` },
            { id: "orders", label: `Orders (${orders.length + pendingOrders.length})` }
          ]}
        />
      </div>

      <div {...tabPanelProps("sup", tab)} style={{ outline: "none" }}>
        {tab === "compare" && (
          <Card>
            {catalogueQ.isLoading && !catalogueQ.data ? (
              <SkeletonBlock label="Loading supplier prices" lines={4} />
            ) : (
              <PriceCompare
                medicines={medicines}
                suppliers={suppliers}
                catalogue={catalogue}
                initialProductId={compareProductId}
                onOrder={(product, supplierId, qty) => setReorder({ product, supplierId, qty })}
                onRecordPrice={online && suppliers.length ? (p) => setPriceFor({ productName: p?.name }) : undefined}
              />
            )}
          </Card>
        )}

        {tab === "suppliers" &&
          (suppliersQ.isLoading && !suppliersQ.data ? (
            <Card><SkeletonBlock label="Loading suppliers" lines={4} /></Card>
          ) : suppliers.length === 0 ? (
            <Card>
              <EmptyState icon={<Truck size={26} />} title="No suppliers yet" actions={<Button variant="primary" disabled={!online} onClick={() => setAddOpen(true)}>Add your first supplier</Button>}>
                Add the wholesalers you buy from. Then record the prices they quote to compare them and order in a few taps.
              </EmptyState>
            </Card>
          ) : (
            <div className="nv-rows" role="list" aria-label="Suppliers" style={{ "--cols": "minmax(200px, 2fr) 140px 110px 150px auto" }}>
              <div className="nv-rows__head" aria-hidden="true"><span>Supplier</span><span>Prices recorded</span><span>Lead time</span><span>Open orders</span><span style={{ textAlign: "right" }}>Contact</span></div>
              {suppliers.map((s) => {
                const prices = catalogue.filter((c) => c.supplierId === s.id);
                const open = openOrders.filter((o) => o.supplierId === s.id);
                const contact = s.whatsapp ?? s.phone;
                return (
                  <div key={s.id} role="listitem" className="nv-row">
                    <button type="button" className="nv-row__main" onClick={() => setSupplierDetail(s)} aria-label={`${s.name}. Open details`}>
                      <span className="nv-row__title">{s.name}</span>
                      <span className="nv-row__sub">{[s.city, s.country].filter(Boolean).join(", ") || "Location not recorded"}</span>
                    </button>
                    <div className="nv-row__side">{open.length > 0 && <Badge tone="info">{open.length} open</Badge>}</div>
                    <div className="nv-row__meta">{prices.length} price{prices.length === 1 ? "" : "s"} · lead time {s.leadDays != null ? `${s.leadDays} d` : "not recorded"}</div>
                    <div className="nv-row__cell">{prices.length}<small>{prices.length ? `latest ${timeAgo(prices.map((p) => p.updatedAt).sort().pop())}` : "none yet"}</small></div>
                    <div className="nv-row__cell">{s.leadDays != null ? `${s.leadDays} days` : "—"}</div>
                    <div className="nv-row__cell">{open.length ? fmt(open.reduce((t, o) => t + o.total, 0)) : "—"}<small>{open.length ? `${open.length} order${open.length === 1 ? "" : "s"}` : "none"}</small></div>
                    <div className="nv-row__actions">
                      {contact ? (
                        <a className="nv-btn nv-btn--sm" href={whatsappLink(contact, `Hello ${s.name},`)} target="_blank" rel="noreferrer" aria-label={`Open WhatsApp with ${s.name}`}>WhatsApp</a>
                      ) : (
                        <span className="nv-hint">No number</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {tab === "orders" &&
          (ordersQ.isLoading && !ordersQ.data ? (
            <Card><SkeletonBlock label="Loading orders" lines={4} /></Card>
          ) : orders.length + pendingOrders.length === 0 ? (
            <Card>
              <EmptyState icon={<Receipt size={26} />} title="No orders yet">Create an order from Price compare, or from Reorder on a product in Inventory.</EmptyState>
            </Card>
          ) : (
            <div className="nv-rows" role="list" aria-label="Purchase orders" style={{ "--cols": "minmax(180px, 1.6fr) minmax(160px, 2fr) 110px 120px 120px" }}>
              <div className="nv-rows__head" aria-hidden="true"><span>Supplier</span><span>Items</span><span>Date</span><span>Total</span><span>Status</span></div>
              {pendingOrders.map((q) => (
                <div key={q.local_id} role="listitem" className="nv-row">
                  <div className="nv-row__main" style={{ cursor: "default" }}>
                    <span className="nv-row__title">{supplierName(q.payload?.p_supplier_id)}</span>
                    <span className="nv-row__sub">{q.summary}</span>
                  </div>
                  <div className="nv-row__side"><Badge tone="pending">Pending sync</Badge></div>
                  <div className="nv-row__meta">Saved on this device · recorded when back online</div>
                  <div className="nv-row__cell">{(q.payload?.p_items ?? []).map((i) => `${i.name} ×${i.qty}`).join(", ")}</div>
                  <div className="nv-row__cell">{fmtDate(q.created_at)}</div>
                  <div className="nv-row__cell nv-num">{fmt((q.payload?.p_items ?? []).reduce((t, i) => t + i.qty * i.unit_price, 0))}</div>
                  <div className="nv-row__cell"><Badge tone="pending">Pending sync</Badge></div>
                </div>
              ))}
              {orders.map((o) => {
                const st = PO_STATUS[o.status] ?? PO_STATUS.draft;
                return (
                  <div key={o.id} role="listitem" className="nv-row">
                    <button type="button" className="nv-row__main" onClick={() => setOrderDetail(o)} aria-label={`Order from ${supplierName(o.supplierId)}, ${fmt(o.total)}. Open details`}>
                      <span className="nv-row__title">{supplierName(o.supplierId)}</span>
                      <span className="nv-row__sub">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ") || "No lines"}</span>
                    </button>
                    <div className="nv-row__side"><Badge tone={st.tone}>{st.label}</Badge></div>
                    <div className="nv-row__meta"><strong className="nv-num">{fmt(o.total)}</strong> · {fmtDate(o.createdAt)}</div>
                    <div className="nv-row__cell">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ") || "—"}</div>
                    <div className="nv-row__cell">{fmtDate(o.createdAt)}</div>
                    <div className="nv-row__cell nv-num">{fmt(o.total)}</div>
                    <div className="nv-row__cell"><Badge tone={st.tone}>{st.label}</Badge></div>
                  </div>
                );
              })}
            </div>
          ))}
      </div>

      <ReorderDialog
        product={reorder?.product ?? null}
        presetSupplierId={reorder?.supplierId}
        presetQty={reorder?.qty}
        onClose={() => setReorder(null)}
        onShowToast={onShowToast}
      />

      <Drawer open={!!supplierDetail} onClose={() => setSupplierDetail(null)} title={supplierDetail?.name ?? "Supplier"} side={layout === "phone" ? "bottom" : "right"}>
        {supplierDetail && (
          <SupplierDetail
            s={supplierDetail}
            prices={catalogue.filter((c) => c.supplierId === supplierDetail.id)}
            orders={orders.filter((o) => o.supplierId === supplierDetail.id)}
            online={online}
            onRecordPrice={() => { setPriceFor({ supplierId: supplierDetail.id }); setSupplierDetail(null); }}
          />
        )}
      </Drawer>

      <Drawer open={!!orderDetail} onClose={() => setOrderDetail(null)} title={orderDetail ? `Order · ${supplierName(orderDetail.supplierId)}` : "Order"} side={layout === "phone" ? "bottom" : "right"}>
        {orderDetail && <OrderDetail o={orderDetail} supplier={suppliers.find((s) => s.id === orderDetail.supplierId)} onInventory={onNavigate ? () => { setOrderDetail(null); onNavigate("inventory"); } : undefined} />}
      </Drawer>

      <AddSupplierDialog open={addOpen} onClose={() => setAddOpen(false)} onShowToast={onShowToast} />
      <RecordPriceDialog open={!!priceFor} preset={priceFor ?? {}} onClose={() => setPriceFor(null)} suppliers={suppliers} medicines={medicines} onShowToast={onShowToast} />
    </div>
  );
}

function SupplierDetail({ s, prices, orders, online, onRecordPrice }) {
  const contact = s.whatsapp ?? s.phone;
  return (
    <div className="nv-stack">
      <dl className="nv-kv" style={{ margin: 0 }}>
        <div><dt>WhatsApp / phone</dt><dd style={{ fontSize: "1rem" }}>{contact ?? "Not recorded"}</dd></div>
        <div><dt>Lead time</dt><dd>{s.leadDays != null ? `${s.leadDays} days` : "Not recorded"}</dd></div>
        <div><dt>Payment terms</dt><dd style={{ fontSize: "1rem" }}>{s.paymentTerms ?? "Not recorded"}</dd></div>
        <div><dt>Reliability</dt><dd style={{ fontSize: "1rem" }}>{s.onTimeRate != null ? `${s.onTimeRate}% on time` : "Not recorded"}<small>Receiving isn’t tracked yet, so it isn’t measured from orders</small></dd></div>
      </dl>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {contact && <a className="nv-btn nv-btn--primary" href={whatsappLink(contact, `Hello ${s.name},`)} target="_blank" rel="noreferrer">Open WhatsApp</a>}
        {s.phone && <a className="nv-btn" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>Call</a>}
        <Button onClick={onRecordPrice} disabled={!online}>Record a price</Button>
      </div>
      <section aria-labelledby="sd-prices">
        <h3 id="sd-prices" className="nv-section-header__title" style={{ marginBottom: 6 }}>Recorded prices</h3>
        {prices.length === 0 ? (
          <p className="nv-hint">No prices recorded for this supplier yet.</p>
        ) : (
          <ul className="nv-timeline">
            {prices.sort((a, b) => a.productName.localeCompare(b.productName)).map((p) => (
              <li key={p.id}>
                <span>{p.productName}{p.moq ? <span className="nv-hint"> · min {p.moq}</span> : null}</span>
                <span className="nv-num" style={{ whiteSpace: "nowrap" }}>{fmt(p.unitCost)} <span className="nv-hint">· {timeAgo(p.updatedAt)}</span></span>
              </li>
            ))}
          </ul>
        )}
        <p className="nv-hint" style={{ marginTop: 6 }}>Only the latest price is kept; earlier prices are not stored yet.</p>
      </section>
      <section aria-labelledby="sd-orders">
        <h3 id="sd-orders" className="nv-section-header__title" style={{ marginBottom: 6 }}>Order history</h3>
        {orders.length === 0 ? (
          <p className="nv-hint">No orders with this supplier yet.</p>
        ) : (
          <ul className="nv-timeline">
            {orders.map((o) => (
              <li key={o.id}>
                <span>{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</span>
                <span className="nv-num" style={{ whiteSpace: "nowrap" }}>{fmt(o.total)} <span className="nv-hint">· {fmtDate(o.createdAt)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderDetail({ o, supplier, onInventory }) {
  const contact = supplier?.whatsapp ?? supplier?.phone;
  const steps = [
    { label: "Order recorded in NevOut Meds", done: true, when: fmtDate(o.createdAt) },
    { label: "Sent to the supplier", done: null, when: "You send it in WhatsApp — NevOut Meds can’t see whether it was sent" },
    { label: "Received", done: o.status === "received", when: o.status === "received" ? fmtDate(o.receivedAt) : "Receiving isn’t recorded in NevOut Meds yet. When stock arrives, add it with Adjust stock in Inventory." }
  ];
  return (
    <div className="nv-stack">
      <ul className="nv-steps" aria-label="Order progress">
        {steps.map((s, i) => (
          <li key={i} data-state={s.done === true ? "done" : s.done === null ? "unknown" : "todo"}>
            <div style={{ fontWeight: 650 }}>{s.label}</div>
            <div className="nv-hint">{s.when}</div>
          </li>
        ))}
      </ul>
      <table className="nv-table">
        <caption className="nv-visually-hidden">Order lines</caption>
        <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Total</th></tr></thead>
        <tbody>
          {o.items.map((l, i) => (
            <tr key={i}><td>{l.name}</td><td className="nv-num">{l.qty}</td><td className="nv-num">{fmt(l.unitPrice)}</td><td className="nv-num">{fmt(l.lineTotal)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><th scope="row" colSpan={3}>Order total</th><td className="nv-num"><strong>{fmt(o.total)}</strong></td></tr></tfoot>
      </table>
      {o.whatsappMessage && (
        <>
          <pre className="nv-wa-preview" tabIndex={0} aria-label="Order message">{o.whatsappMessage}</pre>
          {contact && <a className="nv-btn" href={whatsappLink(contact, o.whatsappMessage)} target="_blank" rel="noreferrer">Open WhatsApp with this order</a>}
        </>
      )}
      {onInventory && <Button variant="ghost" onClick={onInventory}>Go to Inventory to add received stock</Button>}
    </div>
  );
}

function AddSupplierDialog({ open, onClose, onShowToast }) {
  const create = useCreateSupplier();
  const [form, setForm] = useState({ name: "", whatsapp: "", phone: "", city: "", country: "", leadDays: "", paymentTerms: "" });
  const [error, setError] = useState(null);
  const f = (k) => ({ value: form[k], onChange: (e) => setForm((p) => ({ ...p, [k]: e.target.value })) });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Enter the supplier’s name.");
    setError(null);
    try {
      await create.mutateAsync({ name: form.name.trim(), whatsapp: form.whatsapp, phone: form.phone, city: form.city, country: form.country, leadDays: form.leadDays === "" ? null : Math.max(0, Math.trunc(Number(form.leadDays))), paymentTerms: form.paymentTerms });
      onShowToast?.(`${form.name.trim()} added`, "success");
      setForm({ name: "", whatsapp: "", phone: "", city: "", country: "", leadDays: "", paymentTerms: "" });
      onClose();
    } catch (err) {
      setError(err?.message ? `Not saved: ${err.message}` : "Not saved. Check your connection and try again.");
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add supplier" description="Only the name is required." width={560}>
      <form className="nv-stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="Supplier name" required><Input {...f("name")} autoComplete="organization" /></FormField>
        <div className="nv-grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
          <FormField label="WhatsApp" hint="With country code"><Input type="tel" inputMode="tel" {...f("whatsapp")} /></FormField>
          <FormField label="Phone"><Input type="tel" inputMode="tel" {...f("phone")} /></FormField>
          <FormField label="City or town"><Input {...f("city")} /></FormField>
          <FormField label="Country"><Input {...f("country")} /></FormField>
          <FormField label="Usual lead time (days)"><Input type="number" inputMode="numeric" min={0} {...f("leadDays")} /></FormField>
          <FormField label="Payment terms" hint="e.g. cash on delivery"><Input {...f("paymentTerms")} /></FormField>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={create.isPending}>Save supplier</Button>
        </div>
      </form>
    </Dialog>
  );
}

function RecordPriceDialog({ open, preset, onClose, suppliers, medicines, onShowToast }) {
  const record = useRecordSupplierPrice();
  const products = useMemo(() => medicines.map(toProductView).sort((a, b) => a.name.localeCompare(b.name)), [medicines]);
  const [form, setForm] = useState({ supplierId: "", productName: "", unitCost: "", moq: "", stockStatus: "" });
  const [error, setError] = useState(null);
  const [seeded, setSeeded] = useState(null);
  if (open && seeded !== preset) {
    setSeeded(preset);
    setForm({ supplierId: preset.supplierId ?? "", productName: preset.productName ?? "", unitCost: "", moq: "", stockStatus: "" });
    setError(null);
  }
  const f = (k) => ({ value: form[k], onChange: (e) => setForm((p) => ({ ...p, [k]: e.target.value })) });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.supplierId) return setError("Choose the supplier.");
    if (!form.productName) return setError("Choose the product.");
    if (!(Number(form.unitCost) > 0)) return setError("Enter the unit price the supplier quoted.");
    setError(null);
    const product = products.find((p) => p.name === form.productName);
    try {
      await record.mutateAsync({ supplierId: form.supplierId, productName: form.productName, unit: product?.unit ?? null, unitCost: Number(form.unitCost), moq: form.moq === "" ? null : Math.max(1, Math.trunc(Number(form.moq))), stockStatus: form.stockStatus || null });
      onShowToast?.(`Price recorded for ${form.productName}`, "success");
      onClose();
    } catch (err) {
      setError(err?.message ? `Not saved: ${err.message}` : "Not saved. Check your connection and try again.");
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Record a supplier price" description="Replaces this supplier’s previous price for the product." width={540}>
      <form className="nv-stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="Supplier" required>
          <Select {...f("supplierId")}>
            <option value="">Choose a supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Product" required>
          <Select {...f("productName")}>
            <option value="">Choose a product</option>
            {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </Select>
        </FormField>
        <div className="nv-grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))" }}>
          <FormField label="Unit price" required><Input type="number" inputMode="decimal" min={0} step="0.01" {...f("unitCost")} /></FormField>
          <FormField label="Minimum order"><Input type="number" inputMode="numeric" min={1} {...f("moq")} /></FormField>
          <FormField label="Availability">
            <Select {...f("stockStatus")}>
              <option value="">Not known</option>
              <option value="In stock">In stock</option>
              <option value="Limited">Limited</option>
              <option value="Out of stock">Out of stock</option>
            </Select>
          </FormField>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={record.isPending}>Save price</Button>
        </div>
      </form>
    </Dialog>
  );
}
