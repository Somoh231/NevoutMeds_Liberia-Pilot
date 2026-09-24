import { useMemo, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { useFinancialSummary } from "@/platform/data/useFinancialSummary";
import { useProductSales } from "@/platform/data/useProductSales";
import { usePurchaseOrders } from "@/platform/data/usePurchaseOrders";
import { useSuppliers } from "@/platform/data/useSuppliers";
import { toProductView, EXPIRY_LABEL } from "@/platform/features/inventory/model";
import { STATUS } from "@/platform/utils/inventoryStatus";
import { Alert, Button, Card, EmptyState, MetricCard, PageHeader, Select, SkeletonBlock, Tabs, tabPanelProps } from "@/platform/ui";
import { Download } from "@/platform/ui/icons";
import { BarList, DayBars, downloadCsv } from "@/platform/features/reports/charts";
import OtherCurrencies from "@/platform/features/reports/OtherCurrencies";
import { addDays, businessDayKey, moneyIn, moneyTotals, startOfBusinessDay, tenantToday, toMinorUnitString, useCountry } from "@/platform/country";

const RANGES = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" }
];
const REPORTS = [
  { id: "sales", label: "Sales" },
  { id: "products", label: "Products & margin" },
  { id: "inventory", label: "Inventory" },
  { id: "buying", label: "Purchases" },
  { id: "suppliers", label: "Suppliers" },
  { id: "customers", label: "Customers & credit" },
  { id: "expiry", label: "Expiry" }
];
const pctChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/**
 * Decision-ready reports over a chosen period, each exportable as CSV. Charts
 * are plain HTML bars (no chart library) with the numbers as text.
 */
export default function ReportsScreen({ medicines, customers, onNavigate }) {
  const [range, setRange] = useState("30");
  const [report, setReport] = useState("sales");
  const days = Number(range);
  const now = useFinancialSummary(days);
  const both = useFinancialSummary(days * 2);
  const salesQ = useProductSales(days);
  const ordersQ = usePurchaseOrders();
  const suppliersQ = useSuppliers();
  const products = useMemo(() => medicines.map(toProductView), [medicines]);
  const productByName = useMemo(() => new Map(products.map((p) => [p.name.toLowerCase(), p])), [products]);
  // Business dates and money follow the pharmacy's country configuration.
  // Every money column in an export names its currency; amounts in different
  // currencies are never added together.
  const { config } = useCountry();
  const cur = config.currency;
  const amt = (n, currency = cur) => toMinorUnitString(n, currency);
  const stamp = tenantToday();

  const daily = (both.data?.revenue.daily ?? []).map((d) => ({ day: d.day, value: Number(d.total || 0) }));
  const current = daily.slice(-days);
  const previous = daily.slice(0, Math.max(0, daily.length - days));
  const curTotal = now.data?.revenue.total ?? current.reduce((s, d) => s + d.value, 0);
  const prevTotal = previous.reduce((s, d) => s + d.value, 0);
  const change = pctChange(curTotal, prevTotal);

  const productRows = useMemo(() => {
    const agg = new Map();
    for (const l of salesQ.data ?? []) {
      const key = l.name.toLowerCase();
      const a = agg.get(key) ?? { name: l.name, qty: 0, revenue: 0 };
      a.qty += l.qty;
      a.revenue += l.revenue;
      agg.set(key, a);
    }
    return [...agg.values()]
      .map((a) => {
        const p = productByName.get(a.name.toLowerCase());
        const cost = p && p.unitCost > 0 ? p.unitCost * a.qty : null;
        return { ...a, cost, margin: cost !== null && a.revenue > 0 ? ((a.revenue - cost) / a.revenue) * 100 : null };
      })
      .sort((x, y) => y.revenue - x.revenue);
  }, [salesQ.data, productByName]);
  const soldNames = new Set(productRows.map((r) => r.name.toLowerCase()));
  const unsold = products.filter((p) => p.stock > 0 && !soldNames.has(p.name.toLowerCase()));

  const since = startOfBusinessDay(addDays(stamp, -(days - 1)), config.timezone).getTime();
  const orders = (ordersQ.data ?? []).filter((o) => new Date(o.createdAt).getTime() >= since);
  const ordersMixed = new Set(orders.map((o) => o.currency)).size > 1;
  const supplierName = (id) => (suppliersQ.data ?? []).find((s) => s.id === id)?.name ?? "Supplier";

  const Header = ({ title, onExport }) => (
    <div className="nv-section-header">
      <h3 className="nv-section-header__title">{title}</h3>
      {onExport && <Button size="sm" icon={<Download size={16} aria-hidden="true" />} onClick={onExport}>Export CSV</Button>}
    </div>
  );

  return (
    <div className="nv-page">
      <PageHeader title="Reports" description="Sales, stock, buying and credit over the period you choose. Exports open in any spreadsheet." />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginBottom: 16 }}>
        <div style={{ width: 180 }}>
          <label className="nv-label" htmlFor="rep-range" style={{ display: "block", marginBottom: 6 }}>Period</label>
          <Select id="rep-range" value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map((r) => <option key={r.id} value={r.id}>Last {r.label}</option>)}
          </Select>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Tabs idBase="rep" label="Report" value={report} onChange={setReport} tabs={REPORTS} />
      </div>

      <div {...tabPanelProps("rep", report)} style={{ outline: "none" }} className="nv-stack">
        {report === "sales" &&
          (now.isLoading && !now.data ? (
            <Card><SkeletonBlock label="Loading sales" lines={4} /></Card>
          ) : !now.data ? (
            <Alert tone="warning">The sales report is calculated on the server and needs a connection.</Alert>
          ) : (
            <>
              <div className="nv-summary">
                <MetricCard label={`Revenue (${days}d)`} value={fmt(curTotal)} sub={change === null ? "no sales in the previous period to compare" : `${change > 0 ? "+" : ""}${change}% vs previous ${days} days (${fmt(prevTotal)})`} />
                <MetricCard label="Sales" value={now.data.revenue.transactions} sub={now.data.revenue.transactions ? `average ${fmt(curTotal / now.data.revenue.transactions)}` : "none recorded"} />
                <MetricCard label="Gross margin" value={curTotal > 0 ? `${(((curTotal - now.data.cogs.total) / curTotal) * 100).toFixed(1)}%` : "—"} sub={`cost of goods ${fmt(now.data.cogs.total)}`} />
              </div>
              <Card>
                <Header title="Revenue per day" onExport={() => downloadCsv(`sales-by-day-${stamp}.csv`, [["day", "revenue", "currency"], ...current.map((d) => [d.day, amt(d.value), cur])])} />
                <DayBars label={`Revenue per day, last ${days} days`} days={current} format={(v) => fmt(v)} reference={previous.length && prevTotal > 0 ? prevTotal / previous.length : undefined} />
                {/* Only describe the comparison line when one is actually drawn. */}
                <p className="nv-hint">
                  {previous.length > 0 && prevTotal > 0
                    ? `The dashed line is the previous ${days} days’ daily average (${fmt(prevTotal / previous.length)}).`
                    : `No sales in the previous ${days} days, so there is no comparison line yet.`}
                </p>
              </Card>
              <OtherCurrencies summary={now.data} />
              {now.data.revenue.by_method.length > 0 && (
                <Card>
                  <BarList label="By payment method" items={now.data.revenue.by_method.map((m) => ({ label: m.method, value: m.total, note: `${m.count} sales` }))} format={(v) => fmt(v)} />
                </Card>
              )}
            </>
          ))}

        {report === "products" &&
          (salesQ.isLoading ? (
            <Card><SkeletonBlock label="Loading product sales" lines={4} /></Card>
          ) : salesQ.isError ? (
            <Alert tone="warning">Product sales need a connection.</Alert>
          ) : productRows.length === 0 ? (
            <Card><EmptyState title="No product sales in this period">Each sale recorded in the period appears here with units, revenue and margin. Choose a longer period, or record a sale to start the picture.</EmptyState></Card>
          ) : (
            <>
              <Card>
                <Header title="Top products by revenue" onExport={() => downloadCsv(`product-performance-${stamp}.csv`, [["product", "units", "revenue", "cost", "currency", "margin_pct"], ...productRows.map((r) => [r.name, r.qty, amt(r.revenue), r.cost === null ? "" : amt(r.cost), cur, r.margin === null ? "" : r.margin.toFixed(1)])])} />
                <BarList items={productRows.slice(0, 10).map((r) => ({ label: r.name, value: r.revenue, note: `${r.qty} sold${r.margin !== null ? ` · ${r.margin.toFixed(0)}% margin` : ""}` }))} format={(v) => fmt(v)} />
                <p className="nv-hint" style={{ marginTop: 8 }}>Margin uses each product’s current recorded unit cost.</p>
              </Card>
              {unsold.length > 0 && (
                <Card>
                  <Header title={`No sales in ${days} days (${unsold.length})`} />
                  <p className="nv-hint" style={{ marginBottom: 8 }}>{fmt(unsold.reduce((s, p) => s + p.valueAtCost, 0))} at cost sitting on the shelf.</p>
                  <ul className="nv-timeline">{unsold.slice(0, 12).map((p) => <li key={p.id}><span>{p.name}</span><span className="nv-num">{p.stock} {p.unit} · {fmt(p.valueAtCost)}</span></li>)}</ul>
                </Card>
              )}
            </>
          ))}

        {report === "inventory" && (
          <>
            <div className="nv-summary">
              <MetricCard label="Stock at cost" value={fmt(products.reduce((s, p) => s + p.valueAtCost, 0))} sub={`${products.length} products`} />
              <MetricCard label="Need attention" value={products.filter((p) => p.needsAttention).length} sub="out, critical, low or expiring" />
              <MetricCard label="Reorder cost" value={fmt(products.reduce((s, p) => s + p.suggestedReorderCost, 0))} sub="to bring low items to maximum" />
            </div>
            <Card>
              <Header title="Stock value by category" onExport={() => downloadCsv(`inventory-${stamp}.csv`, [["product", "category", "stock", "unit", "status", "days_of_stock", "value_at_cost", "currency", "suggested_reorder", "expiry"], ...products.map((p) => [p.name, p.category, p.stock, p.unit, STATUS[p.status].label, p.daysOfStock ?? "", amt(p.valueAtCost), cur, p.suggestedReorder, p.expiryDate ?? ""])])} />
              <BarList
                items={Object.entries(products.reduce((acc, p) => ({ ...acc, [p.category || "Uncategorised"]: (acc[p.category || "Uncategorised"] ?? 0) + p.valueAtCost }), {}))
                  .map(([label, value]) => ({ label, value }))
                  .sort((a, b) => b.value - a.value)}
                format={(v) => fmt(v)}
              />
            </Card>
            <Card>
              <BarList label="Products by status" items={Object.keys(STATUS).map((k) => ({ label: STATUS[k].label, value: products.filter((p) => p.status === k).length })).filter((i) => i.value > 0)} />
            </Card>
          </>
        )}

        {report === "buying" && (
          <Card>
            <Header title={`Purchase orders · last ${days} days`} onExport={orders.length ? () => downloadCsv(`purchase-orders-${stamp}.csv`, [["date", "supplier", "status", "total", "currency", "items"], ...orders.map((o) => [businessDayKey(o.createdAt, config.timezone), supplierName(o.supplierId), o.status, amt(o.total, o.currency), o.currency, o.items.map((i) => `${i.name} x${i.qty}`).join("; ")])]) : undefined} />
            {orders.length === 0 ? (
              <p className="nv-hint">No purchase orders in this period.</p>
            ) : (
              <>
                <p style={{ marginBottom: 12 }}><strong className="nv-num">{moneyTotals(orders, (o) => o.currency, (o) => o.total)}</strong> across {orders.length} order{orders.length === 1 ? "" : "s"}.</p>
                <BarList
                  label={ordersMixed ? "By supplier and currency" : "By supplier"}
                  items={Object.values(orders.reduce((acc, o) => {
                    // Grouped per currency too: bars in different currencies are never summed.
                    const key = `${o.supplierId}|${o.currency}`;
                    const label = ordersMixed ? `${supplierName(o.supplierId)} (${o.currency})` : supplierName(o.supplierId);
                    return { ...acc, [key]: { label, currency: o.currency, value: (acc[key]?.value ?? 0) + o.total } };
                  }, {})).sort((a, b) => b.value - a.value)}
                  format={(v, i) => moneyIn(v, i.currency)}
                />
              </>
            )}
          </Card>
        )}

        {report === "suppliers" && (
          <Card>
            <Header title="Suppliers" onExport={(suppliersQ.data ?? []).length ? () => downloadCsv(`suppliers-${stamp}.csv`, [["supplier", "lead_days", "orders_in_period", "ordered_value", "currency"], ...(suppliersQ.data ?? []).flatMap((s) => {
              const os = orders.filter((o) => o.supplierId === s.id);
              const byCur = [...new Set(os.map((o) => o.currency))];
              // One row per currency the supplier was ordered in.
              return byCur.length === 0 ? [[s.name, s.leadDays ?? "", 0, "", ""]]
                : byCur.map((c) => { const oc = os.filter((o) => o.currency === c); return [s.name, s.leadDays ?? "", oc.length, amt(oc.reduce((t, o) => t + o.total, 0), c), c]; });
            })]) : undefined} />
            {(suppliersQ.data ?? []).length === 0 ? (
              <p className="nv-hint">No suppliers recorded.</p>
            ) : (
              <ul className="nv-timeline">
                {(suppliersQ.data ?? []).map((s) => {
                  const os = orders.filter((o) => o.supplierId === s.id);
                  return <li key={s.id}><span>{s.name}<span className="nv-hint"> · lead time {s.leadDays != null ? `${s.leadDays} d` : "not recorded"}</span></span><span className="nv-num">{os.length} order{os.length === 1 ? "" : "s"} · {moneyTotals(os, (o) => o.currency, (o) => o.total)}</span></li>;
                })}
              </ul>
            )}
            <p className="nv-hint" style={{ marginTop: 8 }}>Delivery reliability isn’t measured: receiving orders isn’t recorded in NevOut Meds yet.</p>
          </Card>
        )}

        {report === "customers" && (
          <>
            <div className="nv-summary">
              <MetricCard label="Credit outstanding" value={fmt(customers.reduce((s, c) => s + (c.creditBalance || 0), 0))} sub={`${customers.filter((c) => c.creditBalance > 0).length} customers`} />
              <MetricCard label="Over their limit" value={customers.filter((c) => c.creditLimit > 0 && c.creditBalance > c.creditLimit).length} sub="customers" />
              <MetricCard label="Registered customers" value={customers.length} />
            </div>
            <Card>
              <Header title="Largest credit balances" onExport={() => downloadCsv(`customer-credit-${stamp}.csv`, [["customer", "phone", "credit_balance", "credit_limit", "total_spend", "currency", "visits", "last_visit"], ...customers.map((c) => [`${c.firstName} ${c.lastName}`, c.phone, amt(c.creditBalance || 0), amt(c.creditLimit || 0), amt(c.totalSpend || 0), cur, c.visitCount || 0, c.lastVisit ?? ""])])} />
              {customers.filter((c) => c.creditBalance > 0).length === 0 ? (
                <p className="nv-hint">No customer owes anything.</p>
              ) : (
                <BarList items={[...customers].filter((c) => c.creditBalance > 0).sort((a, b) => b.creditBalance - a.creditBalance).slice(0, 10).map((c) => ({ label: `${c.firstName} ${c.lastName}`, value: c.creditBalance, note: c.creditLimit > 0 ? `limit ${fmt(c.creditLimit, 0)}` : "no limit" }))} format={(v) => fmt(v)} />
              )}
            </Card>
          </>
        )}

        {report === "expiry" && (
          <Card>
            <Header title="Expiry exposure" onExport={() => downloadCsv(`expiry-${stamp}.csv`, [["product", "batch", "stock", "expiry", "band", "value_at_cost", "value_at_risk", "currency"], ...products.filter((p) => p.expiry !== "none" && p.stock > 0).map((p) => [p.name, p.batchId, p.stock, p.expiryDate, EXPIRY_LABEL[p.expiry], amt(p.valueAtCost), amt(p.expiry === "expired" ? p.valueAtCost : p.valueAtRiskAtExpiry), cur])])} />
            <BarList
              items={["expired", "urgent", "d30", "d60", "d90"].map((b) => ({ label: EXPIRY_LABEL[b], value: products.filter((p) => p.expiry === b && p.stock > 0).reduce((s, p) => s + p.valueAtCost, 0) }))}
              format={(v) => fmt(v)}
            />
            {onNavigate && <Button size="sm" style={{ marginTop: 12 }} onClick={() => onNavigate("expiry")}>Open expiry alerts</Button>}
          </Card>
        )}
      </div>
    </div>
  );
}
