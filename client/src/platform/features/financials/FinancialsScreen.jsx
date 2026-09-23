import { useMemo, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { useFinancialSummary } from "@/platform/data/useFinancialSummary";
import { usePurchaseOrders } from "@/platform/data/usePurchaseOrders";
import { toProductView } from "@/platform/features/inventory/model";
import { Alert, Button, Card, MetricCard, PageHeader, SectionHeader, SkeletonBlock, Tabs, tabPanelProps } from "@/platform/ui";
import { BarList } from "@/platform/features/reports/charts";

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
  const openOrdersTotal = openOrders.reduce((t, o) => t + o.total, 0);
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
            <section aria-labelledby="fin-in" className="nv-stack">
              <SectionHeader title={<span id="fin-in">Money in · last {days} days</span>} />
              <div className="nv-summary" style={{ marginBottom: 0 }}>
                <MetricCard label={`Revenue (${days}d)`} value={fmt(revenue)} sub={`${s.revenue.transactions} sale${s.revenue.transactions === 1 ? "" : "s"} recorded`} />
                <MetricCard label="Paid at the time of sale" value={fmt(paidNow)} sub="all methods except Credit" />
                <MetricCard label="Sold on credit" value={fmt(onCredit)} sub="not yet collected" />
              </div>
              {(s.revenue.by_method ?? []).length > 0 && (
                <Card>
                  <BarList
                    label="Sales by payment method"
                    items={s.revenue.by_method.map((m) => ({ label: m.method, value: m.total, note: `${m.count} sale${m.count === 1 ? "" : "s"}` }))}
                    format={(v) => fmt(v)}
                  />
                </Card>
              )}
            </section>

            <section aria-labelledby="fin-margin" className="nv-stack">
              <SectionHeader title={<span id="fin-margin">Cost of goods & margin</span>} />
              <div className="nv-summary" style={{ marginBottom: 0 }}>
                <MetricCard label="Cost of goods sold" value={fmt(cogs)} sub="at recorded unit cost" />
                <MetricCard label="Gross profit" value={fmt(gross)} sub={margin === null ? "no sales in this period" : `${margin.toFixed(1)}% gross margin`} />
              </div>
              {s.cogs.untracked_line_items > 0 && (
                <Alert tone="info">{s.cogs.untracked_line_items} sale line{s.cogs.untracked_line_items === 1 ? " was" : "s were"} not linked to a product, so {s.cogs.untracked_line_items === 1 ? "its" : "their"} cost isn’t included — gross profit is overstated by that amount.</Alert>
              )}
            </section>

            <section aria-labelledby="fin-tied" className="nv-stack">
              <SectionHeader title={<span id="fin-tied">Where money is tied up</span>} />
              <div className="nv-summary" style={{ marginBottom: 0 }}>
                <MetricCard label="Customer credit outstanding" value={fmt(creditTotal)} sub={`${s.credit.customers} customer${s.credit.customers === 1 ? "" : "s"}${s.credit.over_limit.length ? ` · ${s.credit.over_limit.length} over limit` : ""}`} onClick={onNavigate ? () => onNavigate("customers") : undefined} />
                <MetricCard label="Stock at cost" value={fmt(s.inventory_value.at_cost)} sub={`sells for ${fmt(s.inventory_value.at_retail)}`} onClick={onNavigate ? () => onNavigate("inventory") : undefined} />
                <MetricCard label="In slow or excess stock" value={fmt(slowValue)} sub="120+ days of stock, or above your maximum" />
              </div>
            </section>

            <section aria-labelledby="fin-out" className="nv-stack">
              <SectionHeader title={<span id="fin-out">Money going out soon</span>} />
              <div className="nv-summary" style={{ marginBottom: 0 }}>
                <MetricCard label="Open purchase orders" value={fmt(openOrdersTotal)} sub={`${openOrders.length} order${openOrders.length === 1 ? "" : "s"} placed, not recorded as received`} onClick={onNavigate ? () => onNavigate("suppliers", { tab: "orders" }) : undefined} />
                <MetricCard label="Reorders due" value={fmt(reorderPressure)} sub="restocking low products to maximum, at recorded cost" onClick={onNavigate ? () => onNavigate("inventory", { filter: "attention" }) : undefined} />
              </div>
              <p className="nv-hint">Payment terms and what you have paid suppliers aren’t recorded, so these are orders and needs — not debts.</p>
            </section>

            {s.credit.over_limit.length > 0 && (
              <Alert tone="warning" title="Customers over their credit limit" actions={onNavigate && <Button size="sm" onClick={() => onNavigate("customers")}>Open customers</Button>}>
                {s.credit.over_limit.map((c) => `${c.name} (${fmt(c.balance)} of ${fmt(c.limit)})`).join(", ")}
              </Alert>
            )}

            <section aria-labelledby="fin-nt" className="nv-card" style={{ boxShadow: "none", background: "var(--nv-surface-inset)" }}>
              <h3 id="fin-nt" className="nv-section-header__title">Not tracked yet — deliberately blank</h3>
              <p className="nv-hint" style={{ margin: "4px 0 12px" }}>
                A true cash balance or projected cash position would need these. NevOut Meds won’t estimate them.
              </p>
              <dl className="nv-kv" style={{ margin: 0 }}>
                {untracked.map((k) => (
                  <div key={k}>
                    <dt>{NOT_TRACKED_COPY[k]?.label ?? k}</dt>
                    <dd style={{ fontSize: "0.875rem", fontWeight: 500 }}>{NOT_TRACKED_COPY[k]?.why ?? "Not recorded."}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
