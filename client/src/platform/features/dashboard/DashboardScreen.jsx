import { useMemo } from "react";
import { fmt, fmtK } from "@/platform/utils/format";
import { timeAgo } from "@/platform/utils/dates";
import { toProductView } from "@/platform/features/inventory/model";
import { buildDailyWhatsappSummary, buildDashboardGreeting, formatDashboardDate } from "@/platform/features/dashboard/summary";
import { useFinancialSummary } from "@/platform/data/useFinancialSummary";
import { useDashboardKpis } from "@/platform/data/useDashboardKpis";
import { useSupplierCatalogue } from "@/platform/data/useSupplierCatalogue";
import { sameProduct } from "@/platform/data/suppliers";
import { useSync } from "@/platform/offline/SyncProvider";
import { ActionCard, Badge, Button, Card, EmptyState, MetricCard, SectionHeader, SkeletonBlock } from "@/platform/ui";
import { BellRing, ChartLine, CircleCheck, Clock, Package, RefreshCw, ShoppingCart, TriangleAlert, Truck, Users, Wallet } from "@/platform/ui/icons";
import { moneyIn, tenantDate, tenantToday } from "@/platform/country/tenant";

/** The pharmacy's business date (its own timezone). */
const TODAY = () => tenantToday();

/**
 * Morning briefing: what needs attention, what is at risk, what changed, what
 * to do next. Every item is computed from recorded data and links straight to
 * the place where it is resolved. No benchmarks, no projections.
 */
export default function DashboardScreen({ user, medicines, customers, dataStatus = { inventory: "ready", customers: "ready" }, onNavigate, onShowToast }) {
  const kpisQ = useDashboardKpis();
  const isOwner = user.role === "owner" || user.role === "admin";
  const finQ = useFinancialSummary(30);
  const catalogueQ = useSupplierCatalogue();
  const sync = useSync();
  const stockReady = dataStatus.inventory === "ready";
  const customersReady = dataStatus.customers === "ready";

  const products = useMemo(() => medicines.map(toProductView), [medicines]);
  const today = TODAY();

  const brief = useMemo(() => {
    const restock = products.filter((p) => p.status === "out" || p.status === "critical");
    const low = products.filter((p) => p.status === "low");
    const expiring = products.filter((p) => ["expired", "urgent", "d30"].includes(p.expiry) && p.stock > 0);
    const expiryValue = expiring.reduce((s, p) => s + p.valueAtRiskAtExpiry, 0);
    const untracked = products.filter((p) => p.status === "untracked");
    const reorderCost = [...restock, ...low].reduce((s, p) => s + p.suggestedReorderCost, 0);
    const remindersDue = customers.flatMap((c) => (c.reminders ?? []).filter((r) => !r.sent && r.dueDate && r.dueDate <= today).map((r) => ({ ...r, customer: c })));
    const overLimit = customers.filter((c) => c.creditLimit > 0 && c.creditBalance > c.creditLimit);
    const creditTotal = kpisQ.data ? kpisQ.data.outstandingCredit : customers.reduce((s, c) => s + (c.creditBalance || 0), 0);
    const withCredit = customers.filter((c) => c.creditBalance > 0).length;
    // Savings: a recorded supplier price below what this pharmacy currently pays.
    const savings = products
      .map((p) => {
        const best = (catalogueQ.data ?? []).filter((c) => sameProduct(c.productName, p.name) && c.unitCost > 0).sort((a, b) => a.unitCost - b.unitCost)[0];
        if (!best || !(p.unitCost > best.unitCost)) return null;
        return { p, pct: Math.round(((p.unitCost - best.unitCost) / p.unitCost) * 100), perUnit: p.unitCost - best.unitCost, nextOrder: p.suggestedReorder * (p.unitCost - best.unitCost) };
      })
      .filter(Boolean)
      .sort((a, b) => b.pct - a.pct);
    return { restock, low, expiring, expiryValue, untracked, reorderCost, remindersDue, overLimit, creditTotal, withCredit, savings };
  }, [products, customers, catalogueQ.data, kpisQ.data, today]);

  const names = (list, n = 3) => list.slice(0, n).map((p) => p.name ?? p).join(", ") + (list.length > n ? ` and ${list.length - n} more` : "");

  // ── What needs attention, most urgent first ──────────────────────────────
  const items = [];
  if (sync.conflicts > 0)
    items.push({ id: "conflict", tone: "conflict", icon: TriangleAlert, title: `${sync.conflicts} change${sync.conflicts === 1 ? "" : "s"} not accepted by the server`, body: "Still saved on this device. Open the sync status (top right) to see why and record it again if needed." });
  if (stockReady && brief.restock.length)
    items.push({ id: "restock", tone: "danger", icon: Package, title: `${brief.restock.length} product${brief.restock.length === 1 ? " is" : "s are"} out of stock or critically low`, body: names(brief.restock), action: { label: "Reorder", go: () => onNavigate("inventory", { filter: "attention" }) } });
  if (stockReady && brief.expiring.length)
    items.push({ id: "expiry", tone: "warning", icon: Clock, title: `${brief.expiring.length} product${brief.expiring.length === 1 ? " expires" : "s expire"} within 30 days`, body: `${names(brief.expiring)}${brief.expiryValue > 0 ? ` · about ${fmt(brief.expiryValue, 0)} at cost may not sell in time` : ""}`, action: { label: "Review expiry", go: () => onNavigate("expiry") } });
  if (customersReady && brief.remindersDue.length)
    items.push({ id: "reminders", tone: "info", icon: BellRing, title: `${brief.remindersDue.length} refill reminder${brief.remindersDue.length === 1 ? " is" : "s are"} due`, body: names(brief.remindersDue.map((r) => `${r.customer.firstName} ${r.customer.lastName} (${r.medicine})`)), action: { label: "Open reminders", go: () => onNavigate("reminders") } });
  if (stockReady && brief.low.length)
    items.push({ id: "low", tone: "warning", icon: Truck, title: `${brief.low.length} product${brief.low.length === 1 ? " is" : "s are"} at the reorder point`, body: names(brief.low), action: { label: "Plan reorder", go: () => onNavigate("inventory", { filter: "low" }) } });
  if (customersReady && brief.overLimit.length)
    items.push({ id: "credit", tone: "warning", icon: Users, title: `${brief.overLimit.length} customer${brief.overLimit.length === 1 ? " is" : "s are"} over their credit limit`, body: names(brief.overLimit.map((c) => `${c.firstName} ${c.lastName}`)), action: { label: "View customers", go: () => onNavigate("customers") } });
  if (stockReady && brief.savings.length)
    items.push({ id: "savings", tone: "brand", icon: Wallet, title: `Cheaper supplier price recorded for ${brief.savings.length} product${brief.savings.length === 1 ? "" : "s"}`, body: `${names(brief.savings.map((s) => `${s.p.name} (${s.pct}% less)`))}`, action: { label: "Compare prices", go: () => onNavigate("suppliers", { compareProductId: brief.savings[0].p.id }) } });
  if (stockReady && brief.untracked.length)
    items.push({ id: "untracked", tone: "neutral", icon: Package, title: `${brief.untracked.length} product${brief.untracked.length === 1 ? " has" : "s have"} no reorder level`, body: "Without one, NevOut Meds cannot warn you before they run out.", action: { label: "Set levels", go: () => onNavigate("inventory", { filter: "untracked" }) } });

  const urgent = items.filter((i) => ["conflict", "restock", "expiry", "reminders"].includes(i.id)).length;
  const [top, ...rest] = items;

  // ── Figures ──────────────────────────────────────────────────────────────
  const revenuePending = kpisQ.isLoading && !kpisQ.data;
  const revenueToday = kpisQ.data?.revenueToday ?? 0;
  const salesToday = kpisQ.data?.salesCountToday ?? 0;
  // Owners: the same server summary Analytics uses. Staff cannot call it, so they get the KPI query.
  const revenue30 = finQ.data ? finQ.data.revenue.total : (kpisQ.data?.revenueLast30Days ?? 0);
  const stockValue = products.reduce((s, p) => s + p.valueAtCost, 0);

  const waSummary = buildDailyWhatsappSummary({
    pharmacy: user.pharmacy,
    lowStockCount: brief.restock.length + brief.low.length,
    creditOut: fmt(brief.creditTotal),
    dueRemindersCount: brief.remindersDue.length,
    revenueToday: fmt(revenueToday),
    salesCountToday: salesToday,
    customersCount: customers.length
  });

  const pendingText = (st, what) => (st === "error" ? `Could not load ${what}. Check your connection.` : `Loading ${what}…`);

  return (
    <div className="nv-page">
      <header style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
        <p className="nv-hint" style={{ fontSize: "0.9375rem" }}>{formatDashboardDate()}</p>
        <h2 className="nv-page-header__title" style={{ marginTop: 2 }}>
          {buildDashboardGreeting()}, {user.name?.split(" ")[0]}
        </h2>
        <p className="nv-page-header__desc" aria-live="polite">
          {!stockReady || !customersReady
            ? "Checking today’s stock, reminders and sales…"
            : urgent > 0
              ? `${urgent} thing${urgent === 1 ? "" : "s"} need${urgent === 1 ? "s" : ""} your attention today.`
              : items.length > 0
                ? "Nothing urgent. A few things are worth a look when you have a moment."
                : "Nothing needs your attention right now."}
        </p>
        </div>
        <Button variant="primary" icon={<ShoppingCart size={18} aria-hidden="true" />} onClick={() => onNavigate("sales")}>New sale</Button>
      </header>

      <div className="nv-dash">
        <section aria-labelledby="attention-h" className="nv-stack">
          <SectionHeader level={3} title={<span id="attention-h">Needs attention</span>} />
          {!stockReady && (
            <Card>
              <div role="status" className="nv-hint" style={{ fontSize: "0.9375rem" }}>{pendingText(dataStatus.inventory, "stock levels")}</div>
              <SkeletonBlock label="Loading" lines={2} />
            </Card>
          )}
          {top ? (
            <>
              <ActionCard
                className={`nv-brief-top nv-tone-${top.tone}`}
                icon={<top.icon size={22} />}
                title={top.title}
                body={top.body}
                onClick={top.action?.go}
                disabled={!top.action}
                trailing={top.action && <span className="nv-btn nv-btn--primary nv-btn--sm" aria-hidden="true">{top.action.label}</span>}
                aria-label={top.action ? `${top.title}. ${top.action.label}` : top.title}
              />
              {rest.length > 0 && (
                <Card flush>
                  <ul className="nv-brief-list">
                    {rest.map((i) => (
                      <li key={i.id} className={`nv-tone-${i.tone}`}>
                        <span className="nv-brief-list__icon" aria-hidden="true"><i.icon size={18} /></span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="nv-brief-list__title">{i.title}</div>
                          <div className="nv-brief-list__body">{i.body}</div>
                        </div>
                        {i.action && <Button size="sm" onClick={i.action.go}>{i.action.label}</Button>}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          ) : (
            stockReady &&
            customersReady && (
              <Card>
                <EmptyState tone="success" icon={<CircleCheck size={26} />} title="All stock levels healthy">
                  No products are low, expiring soon or waiting to sync, and no refills are due today.
                </EmptyState>
              </Card>
            )
          )}
          {!customersReady && (
            <div role="status" className="nv-hint">{pendingText(dataStatus.customers, "reminders")}</div>
          )}
          {sync.pending + sync.failed > 0 && (
            <p className="nv-hint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <RefreshCw size={16} aria-hidden="true" /> {sync.pending + sync.failed} change{sync.pending + sync.failed === 1 ? " is" : "s are"} saved on this device and waiting to sync.
            </p>
          )}
        </section>

        <aside aria-labelledby="today-h" className="nv-stack">
          <SectionHeader level={3} title={<span id="today-h">Today so far</span>} />
          <MetricCard
            label="Sales today"
            pending={revenuePending}
            value={fmt(revenueToday)}
            sub={
              <>
                {salesToday} sale{salesToday === 1 ? "" : "s"} recorded
                {isOwner && (
                  <>
                    {" · "}
                    <span data-metric="revenue-30d">{fmtK(revenue30)}</span> in 30 days
                  </>
                )}
              </>
            }
          />
          <MetricCard
            label="Customer credit outstanding"
            pending={!customersReady && !kpisQ.data}
            value={fmt(brief.creditTotal)}
            sub={`${brief.withCredit} customer${brief.withCredit === 1 ? "" : "s"}${brief.overLimit.length ? ` · ${brief.overLimit.length} over limit` : ""}`}
            onClick={() => onNavigate("customers")}
          />
          {isOwner && (
            <MetricCard
              label="Money in stock"
              pending={!stockReady}
              value={fmt(stockValue, 0)}
              sub={brief.reorderCost > 0 ? `Restocking what’s low: about ${fmt(brief.reorderCost, 0)} at your recorded costs` : "at recorded unit cost"}
              onClick={() => onNavigate("inventory")}
            />
          )}
        </aside>
      </div>

      <div className="nv-grid-2" style={{ marginTop: 20 }}>
        <Card as="section" aria-labelledby="recent-h">
          <SectionHeader title={<span id="recent-h">Recent sales</span>} actions={<Button variant="ghost" size="sm" onClick={() => onNavigate("customers")}>All customers</Button>} />
          {revenuePending ? (
            <SkeletonBlock label="Loading sales" lines={3} />
          ) : (kpisQ.data?.recentSales ?? []).length === 0 ? (
            <p className="nv-hint">No sales recorded yet. Sales are recorded from a customer’s card in Customers.</p>
          ) : (
            <ul className="nv-timeline">
              {kpisQ.data.recentSales.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <span style={{ minWidth: 0 }}>
                    <strong className="nv-num">{moneyIn(s.amount, s.currency)}</strong> · {s.items || "Sale"}
                  </span>
                  <span className="nv-hint" style={{ whiteSpace: "nowrap" }}>{s.method} · {tenantDate(s.date, "dayMonth")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card as="section" aria-labelledby="wa-h">
          <SectionHeader title={<span id="wa-h">Daily WhatsApp summary</span>} description="Opening WhatsApp lets you choose who to send it to. Nothing is sent automatically." />
          <pre className="nv-wa-preview" tabIndex={0} aria-label="Summary text">{waSummary}</pre>
          <a className="nv-btn nv-btn--primary nv-btn--block" style={{ marginTop: 12 }} href={`https://wa.me/?text=${encodeURIComponent(waSummary)}`} target="_blank" rel="noreferrer" onClick={() => onShowToast?.("WhatsApp opened — choose who to send the summary to", "info")}>
            Open WhatsApp to send
          </a>
        </Card>
      </div>

      {isOwner && (
        <p className="nv-hint" style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <ChartLine size={16} aria-hidden="true" /> Trends, margins and product performance are in Analytics; cash position in Financials.
        </p>
      )}
    </div>
  );
}
