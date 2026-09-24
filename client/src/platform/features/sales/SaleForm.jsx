import { useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { getPaymentMethods, paymentMethodHint, useCountry } from "@/platform/country";
import { applyPurchaseToCustomer, buildPurchaseItemString, todayISO } from "@/platform/features/customers/purchases";
import { toProductView } from "@/platform/features/inventory/model";
import { Alert, Button, IconButton, SearchInput } from "@/platform/ui";
import { CircleCheck, CloudUpload, Minus, Plus, X } from "@/platform/ui/icons";


/**
 * The counter's most frequent task. Customer → products → payment → record.
 * The transaction and its idempotency are unchanged (record_purchase_idempotent
 * via onRecordPurchase); this component only makes the steps fast and the
 * outcome honest: "Saved on this device · Pending sync" is never shown as
 * "Synced".
 */
export default function SaleForm({ customers, medicines, initialCustomer = null, onRecordPurchase, setCustomers, onShowToast, onRegisterCustomer, onDone, closeOnRecord = false }) {
  const [customerId, setCustomerId] = useState(initialCustomer?.id ?? null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [lines, setLines] = useState([]); // { productId, qty }
  // The pharmacy's enabled methods (country defaults unless the owner chose);
  // the server re-checks the method on every sale.
  const { config } = useCountry();
  const methods = useMemo(() => getPaymentMethods(config), [config]);
  const [method, setMethod] = useState(() => (methods.includes("Cash") ? "Cash" : methods[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const productSearchRef = useRef(null);
  const resultRef = useRef(null);
  // Bring the outcome into view and to the screen reader as soon as it exists.
  useEffect(() => {
    if (result) resultRef.current?.focus({ preventScroll: false });
  }, [result]);

  const products = useMemo(() => medicines.map(toProductView), [medicines]);
  const customer = customers.find((c) => String(c.id) === String(customerId)) ?? null;
  const productById = (id) => products.find((p) => p.id === String(id));

  const cq = customerQuery.trim().toLowerCase();
  const customerMatches = cq
    ? customers.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(cq) || String(c.phone).replace(/\s/g, "").includes(cq.replace(/\s/g, ""))).slice(0, 6)
    : [];
  const pq = productQuery.trim().toLowerCase();
  const productMatches = pq ? products.filter((p) => [p.name, p.brand, p.category].some((v) => v && v.toLowerCase().includes(pq))).slice(0, 8) : [];

  const priced = lines.map((l) => {
    const p = productById(l.productId);
    return { ...l, p, lineTotal: p ? p.sellingPrice * l.qty : 0, short: p ? l.qty > p.stock : false };
  });
  const total = priced.reduce((s, l) => s + l.lineTotal, 0);
  const shortLines = priced.filter((l) => l.short);
  const creditAfter = customer ? customer.creditBalance + (method === "Credit" ? total : 0) : 0;
  const overLimit = method === "Credit" && customer && customer.creditLimit > 0 && creditAfter > customer.creditLimit;

  const addProduct = (p) => {
    setLines((prev) => (prev.some((l) => l.productId === p.id) ? prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { productId: p.id, qty: 1 }]));
    setProductQuery("");
    setError(null);
    requestAnimationFrame(() => productSearchRef.current?.focus());
  };
  const setQty = (id, qty) => setLines((prev) => prev.map((l) => (l.productId === id ? { ...l, qty: Math.max(1, Math.trunc(Number(qty) || 1)) } : l)));
  const remove = (id) => setLines((prev) => prev.filter((l) => l.productId !== id));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!customer) return setError("Choose the customer first.");
    if (lines.length === 0) return setError("Add at least one product.");
    if (shortLines.length) return setError(`Not enough stock: ${shortLines.map((l) => `${l.p.name} (${l.p.stock} left)`).join(", ")}.`);
    if (priced.some((l) => !(l.p?.sellingPrice > 0))) return setError("A product has no selling price. Set one in Inventory first.");
    setError(null);
    setBusy(true);
    const items = priced.map((l) => ({ productId: l.p.id, name: l.p.name, qty: l.qty, unitPrice: l.p.sellingPrice }));
    try {
      const outcome = await onRecordPurchase({ customerId: customer.id, customerName: `${customer.firstName} ${customer.lastName}`, method, items });
      const queued = outcome?.status === "queued";
      const itemsText = items.map((i) => buildPurchaseItemString(i.name, i.qty)).join(", ");
      // Only after the write succeeded or was durably queued.
      setCustomers?.((prev) => prev.map((c) => (c.id === customer.id ? applyPurchaseToCustomer(c, { items: itemsText, amount: total, method, staffId: 1, date: todayISO() }) : c)));
      onShowToast?.(queued ? `Sale saved on this device — ${fmt(total)} · will sync when you are back online` : `Sale recorded — ${fmt(total)}`, queued ? "info" : "success");
      // Quick sale from a customer's row: close and let the toast report the
      // outcome, so the pharmacist can move straight on. The Sales screen
      // keeps the full result panel.
      if (closeOnRecord && onDone) onDone();
      else setResult({ queued, total, itemsText, customerName: `${customer.firstName} ${customer.lastName}`, method });
    } catch (err) {
      setError(err?.message ? `The sale was not recorded: ${err.message}` : "The sale was not recorded. Nothing was saved — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="nv-stack" role="status" ref={resultRef} tabIndex={-1} style={{ outline: "none", scrollMarginTop: 96 }}>
        <div className="nv-sale-done">
          {result.queued ? (
            <span className="nv-sale-done__mark nv-tone-pending" aria-hidden="true"><CloudUpload size={20} /></span>
          ) : (
            <span className="nv-success-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="nv-overline">{result.queued ? "On this device" : "Recorded"}</div>
            <div className="nv-figure-lg">{fmt(result.total)}</div>
          </div>
        </div>
        {result.queued ? (
          <Alert tone="pending" title="Saved on this device · Pending sync">
            {fmt(result.total)} · {result.itemsText}. It will be recorded on the server automatically when this device is back online. Stock on this device already reflects it.
          </Alert>
        ) : (
          <Alert tone="success" title="Sale recorded · Synced">
            {fmt(result.total)} · {result.itemsText} · {result.method} · {result.customerName}
          </Alert>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={() => { setResult(null); setLines([]); if (!initialCustomer) setCustomerId(null); setMethod("Cash"); }}>New sale</Button>
          {onDone && <Button onClick={onDone}>Done</Button>}
        </div>
      </div>
    );
  }

  return (
    <form className="nv-sale" onSubmit={submit} noValidate>
      {/* 1 · Customer */}
      <section className="nv-sale__step" aria-labelledby="sale-customer">
        <h3 id="sale-customer" className="nv-sale__label">Customer</h3>
        {customer ? (
          <div className="nv-sale__chosen">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 650 }}>{customer.firstName} {customer.lastName}</div>
              <div className="nv-hint">
                {customer.phone}
                {customer.creditBalance > 0 ? ` · ${fmt(customer.creditBalance)} on credit` : ""}
              </div>
            </div>
            {!initialCustomer && <Button size="sm" variant="ghost" onClick={() => setCustomerId(null)}>Change</Button>}
          </div>
        ) : null}
        {customer && customer.allergies?.length > 0 && (
          <Alert tone="danger" title="Recorded allergies">{customer.allergies.join(", ")}</Alert>
        )}
        {customer ? null : (
          <>
            <SearchInput
              label="Find customer"
              placeholder="Name or phone"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              autoComplete="off"
              onKeyDown={(e) => {
                // Enter picks the top match instead of submitting the sale.
                if (e.key === "Enter") { e.preventDefault(); if (customerMatches[0]) { setCustomerId(customerMatches[0].id); setCustomerQuery(""); } }
              }}
            />
            {cq && (
              <ul className="nv-picklist" aria-label="Matching customers">
                {customerMatches.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => { setCustomerId(c.id); setCustomerQuery(""); setError(null); }}>
                      <span>{c.firstName} {c.lastName}</span>
                      <span className="nv-hint">{c.phone}</span>
                    </button>
                  </li>
                ))}
                {customerMatches.length === 0 && <li className="nv-hint" style={{ padding: 12 }}>No customer matches “{customerQuery}”.</li>}
              </ul>
            )}
            {onRegisterCustomer && (
              <button type="button" className="nv-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={onRegisterCustomer}>
                New customer? Register them first
              </button>
            )}
          </>
        )}
      </section>

      {/* 2 · Products */}
      <section className="nv-sale__step" aria-labelledby="sale-products">
        <h3 id="sale-products" className="nv-sale__label">Products</h3>
        <SearchInput
          ref={productSearchRef}
          label="Find a product"
          placeholder="Search products"
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); const first = productMatches.find((p) => p.stock > 0); if (first) addProduct(first); }
          }}
        />
        {pq && (
          <ul className="nv-picklist" aria-label="Matching products">
            {productMatches.map((p) => (
              <li key={p.id}>
                <button type="button" data-product-result={p.name} disabled={p.stock <= 0} onClick={() => addProduct(p)}>
                  <span>{p.name}</span>
                  <span className="nv-hint nv-num">{p.stock <= 0 ? "Out of stock" : `${p.stock} in stock · ${fmt(p.sellingPrice)}`}</span>
                </button>
              </li>
            ))}
            {productMatches.length === 0 && <li className="nv-hint" style={{ padding: 12 }}>No product matches “{productQuery}”.</li>}
          </ul>
        )}
        {priced.length > 0 && (
          <ul className="nv-sale__lines" aria-label="Items in this sale">
            {priced.map((l) => (
              <li key={l.productId} className={`nv-enter${l.short ? " is-short" : ""}`}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>{l.p?.name}</div>
                  <div className="nv-hint nv-num">
                    {fmt(l.p?.sellingPrice ?? 0)} each{l.short ? ` · only ${l.p.stock} in stock` : ""}
                  </div>
                </div>
                <div className="nv-qty">
                  <IconButton label={`One less ${l.p?.name}`} onClick={() => setQty(l.productId, l.qty - 1)} disabled={l.qty <= 1}><Minus size={16} /></IconButton>
                  <input type="number" className="nv-input nv-num" inputMode="numeric" min={1} aria-label={`Quantity of ${l.p?.name}`} value={l.qty} onChange={(e) => setQty(l.productId, e.target.value)} />
                  <IconButton label={`One more ${l.p?.name}`} onClick={() => setQty(l.productId, l.qty + 1)}><Plus size={16} /></IconButton>
                </div>
                <div className="nv-num" style={{ fontWeight: 650, minWidth: 64, textAlign: "right" }}>{fmt(l.lineTotal)}</div>
                <IconButton label={`Remove ${l.p?.name}`} onClick={() => remove(l.productId)}><X size={16} /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3 · Payment */}
      <fieldset className="nv-sale__step" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <legend className="nv-sale__label">Payment</legend>
        <div className="nv-chips" style={{ flexWrap: "wrap" }}>
          {methods.map((m) => (
            <label key={m} className="nv-chip nv-chip--radio" data-checked={method === m} title={paymentMethodHint(m)}>
              <input type="radio" name="sale-method" className="nv-visually-hidden" value={m} checked={method === m} onChange={() => setMethod(m)} />
              {m}
            </label>
          ))}
        </div>
        {method === "Credit" && customer && (
          <Alert tone={overLimit ? "warning" : "info"}>
            Adds {fmt(total)} to {customer.firstName}’s balance: {fmt(customer.creditBalance)} → <strong>{fmt(creditAfter)}</strong>
            {customer.creditLimit > 0 ? ` (limit ${fmt(customer.creditLimit)})` : " (no credit limit set)"}.
            {overLimit ? " This goes over their limit." : ""}
          </Alert>
        )}
      </fieldset>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="nv-sale__total">
        <div>
          <div className="nv-hint">Total</div>
          <div className="nv-figure-xl nv-sale__sum" aria-live="polite">{fmt(total)}</div>
          {priced.length > 0 && <div className="nv-hint nv-num">{priced.reduce((n, l) => n + Number(l.qty || 0), 0)} item{priced.reduce((n, l) => n + Number(l.qty || 0), 0) === 1 ? "" : "s"} · {method}</div>}
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy} icon={<CircleCheck size={18} aria-hidden="true" />}>
          Record sale
        </Button>
      </div>
      <p className="nv-hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <CloudUpload size={14} aria-hidden="true" /> Works offline: the sale is saved on this device and synced automatically.
      </p>
    </form>
  );
}
