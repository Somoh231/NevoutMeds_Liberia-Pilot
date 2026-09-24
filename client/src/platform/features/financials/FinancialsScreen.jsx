import { useMemo, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { useFinancialSummary } from "@/platform/data/useFinancialSummary";
import { usePurchaseOrders } from "@/platform/data/usePurchaseOrders";
import { toProductView } from "@/platform/features/inventory/model";
import { Alert, Button, Card, PageHeader, SkeletonBlock, Tabs, tabPanelProps } from "@/platform/ui";
import { BarList } from "@/platform/features/reports/charts";
import OtherCurrencies from "@/platform/features/reports/OtherCurrencies";
import { moneyTotals } from "@/platform/country/tenant";

// Phase 3 rule, kept: every figure comes from recorded sales, sale lines,
// stock, purchase orders and customer credit for this pharmacy. Operating
// expenses, cash on hand, supplier debt and payroll are NOT recorded anywhere
// in the product, so they are declared as such instead of being estimated.
const NOT_TRACKED_COPY = {
  operating_expenses: { label: "Operating expenses", why: "Rent, salaries, utilities and other outgoings are not recorded in NevOut Meds yet." },
  cash_on_hand: { label: "Cash on hand", why: "There is no till or bank reconciliation, so a cash balance cannot be derived." },
  supplier_debt: { label: "Supplier debt", why: "Purchase orders capture what was ordered, not what has been paid." },
  payroll: { label: "Payroll", why: "Staff pay is not recorded in the system." }
};

const RANGES = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" }
];

export default function FinancialsScreen({ customers, medicines = [], onNavigate }) {
  const [range, setRange] = useState("30");
  const days = Number(range);
  const q = useFinancialSummary(days);
  const ordersQ = usePurchaseOrders();
  const s = q.data;
  const products = useMemo(() => medicines.map(toProductView), [medicines]);

  const revenue = s?.revenue.total ?? 0;
  const cogs = s?.cogs.total ?? 0;
  const gross = revenue - cogs;
  const margin = revenue > 0 ? (gross / revenue) * 100 : null;
  const onCredit = (s?.revenue.by_method ?? []).find((m) => m.method === "Credit")?.total ?? 0;
  const paidNow = revenue - onCredit;
  const creditTotal = s?.credit.outstanding ?? customers.reduce((t, c) => t + (c.creditBalance || 0), 0);
  const openOrders = (ordersQ.data ?? []).filter((o) => o.status === "sent" || o.status === "draft");
  // Orders can be in a supplier's currency: summed per currency, never converted.
  const openOrdersTotal = moneyTotals(openOrders, (o) => o.currency, (o) => o.total);
  const slowValue = products.filter((p) => p.stock > 0 && ((p.daysOfStock !== null && p.daysOfStock > 120) || p.status === "overstock")).reduce((t, p) => t + p.valueAtCost, 0);
  const reorderPressure = products.reduce((t, p) => t + p.suggestedReorderCost, 0);
  const untracked = s?.not_tracked ?? Object.keys(NOT_TRACKED_COPY);

  return (
    <div className="nv-page">
      <PageHeader title="Cash flow & financials" description="What came in, what it cost, and where money is tied up — from your recorded sales, stock and orders." />
      <div style={{ marginBottom: 16 }}>
        <Tabs idBase="fin" label="Period" value={range} onChange={setRange} tabs={RANGES} />
      </div>

      <div {...tabPanelProps("fin", range)} style={{ outline: "none" }} className="nv-stack">
        {q.isLoading && !s ? (
          <Card><SkeletonBlock label="Loading financial summary" lines={5} /></Card>
        ) : q.isError && !s ? (
          <Alert tone="warning" title="The financial summary needs a connection">It is calculated on the server from all recorded sales. Try again when you are back online.</Alert>
        ) : (
          <>
            {/* Headline: the three figures an owner checks first. */}
            <dl className="nv-pulse" style={{ margin: 0 }}>
              <div><dt>Revenue ({days}d)</dt><dd className="nv-figure-xl">{fmt(revenue)}</dd><dd className="nv-pulse__sub">{s.revenue.transactions} sale{s.revenue.transactions === 1 ? "" : "s"} recorded</dd></div>
              <div><dt>Gross profit</dt><dd className="nv-figure-xl">{fmt(gross)}</dd><dd className="nv-pulse__sub">after cost of goods {fmt(cogs)}</dd></div>
              <div><dt>Gross margin</dt><dd className="nv-figure-xl">{margin === null ? "—" : `${margin.toFixed(1)}%`}</dd><dd className="nv-pulse__sub">{margin === null ? "no sales in this period" : "at recorded unit costs"}</dd></div>
            </dl>
            <OtherCurrencies summary={s} />

            {/* The statement: label left, figure right, grouped like a ledger. */}
            <div className="nv-statement">
              <section className="nv-statement__group" aria-labelledby="fin-in">
                <div className="nv-statement__head"><h3 id="fin-in" className="nv-statement__title">Money in · last {days} days</h3></div>
                <dl>
                  <div className="nv-statement__row"><dt>Paid at the time of sale<small>all methods except Credit</small></dt><dd className="nv-figure">{fmt(paidNow)}</dd></div>
                  <div className="nv-statement__row"><dt>Sold on credit<small>not yet collected</small></dt><dd className="nv-figure">{fmt(onCredit)}</dd></div>
                  <div className="nv-statement__row is-total"><dt>Revenue ({days}d)</dt><dd className="nv-figure">{fmt(revenue)}</dd></div>
                </dl>
              </section>
              <section className="nv-statement__group" aria-labelledby="fin-margin">
                <div className="nv-statement__head"><h3 id="fin-margin" className="nv-statement__title">Cost of goods &amp; margin</h3></div>
                <dl>
                  <div className="nv-statement__row"><dt>Revenue</dt><dd className="nv-figure">{fmt(revenue)}</dd></div>
                  <div className="nv-statement__row"><dt>Cost of goods sold<small>at recorded unit cost</small></dt><dd className="nv-figure">−{fmt(cogs)}</dd></div>
                  <div className="nv-statement__row is-total"><dt>Gross profit<small>{margin === null ? "no sales in this period" : `${margin.toFixed(1)}% gross margin`}</small></dt><dd className="nv-figure">{fmt(gross)}</dd></div>
                </dl>
              </section>
              <section className="nv-statement__group" aria-labelledby="fin-tied">
                <div className="nv-statement__head"><h3 id="fin-tied" className="nv-statement__title">Where money is tied up</h3></div>
                <dl>
                  <div className="nv-statement__row"><dt>{onNavigate ? <button type="button" className="nv-pulse__link" onClick={() => onNavigate("customers")}>Customer credit outstanding</button> : "Customer credit outstanding"}<small>{s.credit.customers} customer{s.credit.customers === 1 ? "" : "s"}{s.credit.over_limit.length ? ` · ${s.credit.over_limit.length} over limit` : ""}</small></dt><dd className="nv-figure">{fmt(creditTotal)}</dd></div>
                  <div className="nv-statement__row"><dt>{onNavigate ? <button type="button" className="nv-pulse__link" onClick={() => onNavigate("inventory")}>Stock at cost</button> : "Stock at cost"}<small>sells for {fmt(s.inventory_value.at_retail)}</small></dt><dd className="nv-figure">{fmt(s.inventory_value.at_cost)}</dd></div>
                  <div className="nv-statement__row"><dt>In slow or excess stock<small>120+ days of stock, or above your maximum</small></dt><dd className="nv-figure">{fmt(slowValue)}</dd></div>
                </dl>
              </section>
              <section className="nv-statement__group" aria-labelledby="fin-out">
                <div className="nv-statement__head"><h3 id="fin-out" className="nv-statement__title">Money going out soon</h3><span className="nv-statement__note">orders and needs — not debts</span></div>
                <dl>
                  <div className="nv-statement__row"><dt>{onNavigate ? <button type="button" className="nv-pulse__link" onClick={() => onNavigate("suppliers", { tab: "orders" })}>Open purchase orders</button> : "Open purchase orders"}<small>{openOrders.length} order{openOrders.length === 1 ? "" : "s"} placed, not recorded as received</small></dt><dd className="nv-figure">{openOrdersTotal}</dd></div>
                  <div className="nv-statement__row"><dt>{onNavigate ? <button type="button" className="nv-pulse__link" onClick={() => onNavigate("inventory", { filter: "attention" })}>Reorders due</button> : "Reorders due"}<small>restocking low products to maximum, at recorded cost</small></dt><dd className="nv-figure">{fmt(reorderPressure)}</dd></div>
                </dl>
                <p className="nv-hint" style={{ padding: "0 var(--nv-panel-pad) var(--nv-space-3)" }}>Payment terms and what you have paid suppliers aren’t recorded, so these are orders and needs — not debts.</p>
              </section>
              <section className="nv-statement__group" aria-labelledby="fin-nt">
                <div className="nv-statement__head"><h3 id="fin-nt" className="nv-statement__title">Not tracked yet — deliberately blank</h3></div>
                <p className="nv-hint" style={{ padding: "0 var(--nv-panel-pad) var(--nv-space-2)" }}>A true cash balance or projected cash position would need these. NevOut Meds won’t estimate them.</p>
                <dl>
                  {untracked.map((k) => (
                    <div key={k} className="nv-statement__row is-blank">
                      <dt>{NOT_TRACKED_COPY[k]?.label ?? k}<small>{NOT_TRACKED_COPY[k]?.why ?? "Not recorded."}</small></dt>
                      <dd>Not recorded</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>

            {s.cogs.untracked_line_items > 0 && (
              <Alert tone="info">{s.cogs.untracked_line_items} sale line{s.cogs.untracked_line_items === 1 ? " was" : "s were"} not linked to a product, so {s.cogs.untracked_line_items === 1 ? "its" : "their"} cost isn’t included — gross profit is overstated by that amount.</Alert>
            )}
            {(s.revenue.by_method ?? []).length > 0 && (
              <Card>
                <BarList
                  label="Sales by payment method"
                  items={s.revenue.by_method.map((m) => ({ label: m.method, value: m.total, note: `${m.count} sale${m.count === 1 ? "" : "s"}` }))}
                  format={(v) => fmt(v)}
                />
              </Card>
            )}
            {s.credit.over_limit.length > 0 && (
              <Alert tone="warning" title="Customers over their credit limit" actions={onNavigate && <Button size="sm" onClick={() => onNavigate("customers")}>Open customers</Button>}>
                {s.credit.over_limit.map((c) => `${c.name} (${fmt(c.balance)} of ${fmt(c.limit)})`).join(", ")}
              </Alert>
            )}
          </>
        )}
      </div>
    </div>
  );
}
