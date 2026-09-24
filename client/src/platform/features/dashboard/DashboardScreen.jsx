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
import { Button, Card, EmptyState, SectionHeader, SkeletonBlock } from "@/platform/ui";
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
  // Tiers: what to decide now, what is at risk, what could be gained, housekeeping.
  const TIER = { conflict: "decide", restock: "decide", expiry: "risk", reminders: "risk", low: "risk", credit: "risk", savings: "opportunity", untracked: "housekeeping" };
  const [top, ...rest] = items;
  const tiers = [
    { id: "decide", label: "Decide now" },
    { id: "risk", label: "Risks" },
    { id: "opportunity", label: "Opportunities" },
    { id: "housekeeping", label: "Housekeeping" }
  ].map((t) => ({ ...t, items: rest.filter((i) => TIER[i.id] === t.id) })).filter((t) => t.items.length);

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

  // Recent sales as a timeline grouped by business day ("Today", "Yesterday", date).
  const dayLabel = (d) => {
    const label = tenantDate(d, "dayMonth");
    if (label === tenantDate(new Date(), "dayMonth")) return "Today";
    if (label === tenantDate(new Date(Date.now() - 86400000), "dayMonth")) return "Yesterday";
    return label;
  };
  const recent = (kpisQ.data?.recentSales ?? []).slice(0, 6);

  return (
    <div className="nv-page nv-dashboard">
      <header className="nv-dash-head">
        <div style={{ minWidth: 0 }}>
          <p className="nv-dash-head__date">{formatDashboardDate()}</p>
          <h2 className="nv-dash-head__title">
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
          <SectionHeader level={3} title={<span id="attention-h">Needs attention</span>} description={items.length ? `${items.length} item${items.length === 1 ? "" : "s"}, most urgent first` : undefined} />
          {!stockReady && (
            <Card>
              <div role="status" className="nv-hint" style={{ fontSize: "0.9375rem" }}>{pendingText(dataStatus.inventory, "stock levels")}</div>
              <SkeletonBlock label="Loading" lines={2} />
            </Card>
          )}
          {top ? (
            <>
              {/* The one decision surface on the screen. */}
              <button
                type="button"
                className={`nv-brief-top nv-decision nv-tone-${top.tone} ${["danger", "conflict"].includes(top.tone) ? "nv-plane-critical" : "nv-plane-decision"} nv-enter`}
                onClick={top.action?.go}
                disabled={!top.action}
                aria-label={top.action ? `${top.title}. ${top.action.label}` : top.title}
              >
                <span className="nv-decision__icon" aria-hidden="true"><top.icon size={22} /></span>
                <span className="nv-decision__text">
                  <span className="nv-overline nv-decision__tier">{TIER[top.id] === "decide" ? "Decide now" : "Most important today"}</span>
                  <span className="nv-decision__title">{top.title}</span>
                  <span className="nv-decision__body">{top.body}</span>
                </span>
                {top.action && <span className="nv-btn nv-btn--primary nv-decision__action" aria-hidden="true">{top.action.label}</span>}
              </button>
              {tiers.map((t) => (
                <div key={t.id} className="nv-queue" role="group" aria-labelledby={`tier-${t.id}`}>
                  <div id={`tier-${t.id}`} className="nv-overline nv-queue__label">{t.label}</div>
                  <ul className="nv-queue__list nv-enter-stagger">
                    {t.items.map((i) => (
                      <li key={i.id} className={`nv-queue__item nv-tone-${i.tone}`}>
                        <span className="nv-queue__icon" aria-hidden="true"><i.icon size={18} /></span>
                        <div className="nv-queue__text">
                          <div className="nv-queue__title">{i.title}</div>
                          <div className="nv-queue__body">{i.body}</div>
                        </div>
                        {i.action && <Button size="sm" className="nv-queue__action" onClick={i.action.go}>{i.action.label}</Button>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
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

        <aside aria-labelledby="today-h" className="nv-stack nv-dash__aside">
          <SectionHeader level={3} title={<span id="today-h">Today so far</span>} />
          {/* Supporting figures as one instrument, not a stack of big cards. */}
          <dl className="nv-pulse nv-pulse--stack" style={{ margin: 0 }}>
            <div>
              <dt>Sales today</dt>
              <dd className="nv-figure-lg">{revenuePending ? <span className="nv-skeleton" style={{ height: 26, width: 110 }} role="status" aria-label="Loading" /> : fmt(revenueToday)}</dd>
              <dd className="nv-pulse__sub">
                {salesToday} sale{salesToday === 1 ? "" : "s"} recorded
                {isOwner && <>{" · "}<span data-metric="revenue-30d">{fmtK(revenue30)}</span> in 30 days</>}
              </dd>
            </div>
            <div>
              <dt>Customer credit outstanding</dt>
              <dd className="nv-figure-lg">{!customersReady && !kpisQ.data ? <span className="nv-skeleton" style={{ height: 26, width: 110 }} role="status" aria-label="Loading" /> : fmt(brief.creditTotal)}</dd>
              <dd className="nv-pulse__sub">
                <button type="button" className="nv-link nv-link--quiet nv-pulse__link" onClick={() => onNavigate("customers")}>
                  {brief.withCredit} customer{brief.withCredit === 1 ? "" : "s"}{brief.overLimit.length ? ` · ${brief.overLimit.length} over limit` : ""}
                </button>
              </dd>
            </div>
            {isOwner && (
              <div>
                <dt>Money in stock</dt>
                <dd className="nv-figure-lg">{!stockReady ? <span className="nv-skeleton" style={{ height: 26, width: 110 }} role="status" aria-label="Loading" /> : fmt(stockValue, 0)}</dd>
                <dd className="nv-pulse__sub">
                  <button type="button" className="nv-link nv-link--quiet nv-pulse__link" onClick={() => onNavigate("inventory")}>
                    {brief.reorderCost > 0 ? `Restocking what’s low: about ${fmt(brief.reorderCost, 0)}` : "at recorded unit cost"}
                  </button>
                </dd>
              </div>
            )}
          </dl>

          <Card as="section" aria-labelledby="recent-h">
            <SectionHeader title={<span id="recent-h">Recent sales</span>} actions={<Button variant="ghost" size="sm" onClick={() => onNavigate("sales")}>Sales</Button>} />
            {revenuePending ? (
              <SkeletonBlock label="Loading sales" lines={3} />
            ) : recent.length === 0 ? (
              <p className="nv-hint">No sales recorded yet. Record one with New sale; it appears here straight away.</p>
            ) : (
              <ol className="nv-activity">
                {recent.map((s, idx) => {
                  const day = dayLabel(s.date);
                  const showDay = idx === 0 || dayLabel(recent[idx - 1].date) !== day;
                  return (
                    <li key={s.id} className="nv-activity__item">
                      {showDay && <div className="nv-overline nv-activity__day">{day}</div>}
                      <div className="nv-activity__row">
                        <span className="nv-activity__what">{s.items || "Sale"}<small>{s.method}</small></span>
                        <strong className="nv-figure">{moneyIn(s.amount, s.currency)}</strong>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card as="section" aria-labelledby="wa-h">
            <SectionHeader title={<span id="wa-h">Daily WhatsApp summary</span>} description="You choose who receives it. Nothing is sent automatically." />
            <pre className="nv-wa-preview" tabIndex={0} aria-label="Summary text" style={{ marginBottom: 12 }}>{waSummary}</pre>
            <a className="nv-btn nv-btn--block" href={`https://wa.me/?text=${encodeURIComponent(waSummary)}`} target="_blank" rel="noreferrer" onClick={() => onShowToast?.("WhatsApp opened — choose who to send the summary to", "info")}>
              Open WhatsApp to send
            </a>
          </Card>
        </aside>
      </div>

      {isOwner && (
        <p className="nv-hint" style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <ChartLine size={16} aria-hidden="true" /> Trends, margins and product performance are in Analyst and Reports; cash position in Financials.
        </p>
      )}
    </div>
  );
}
