import { FONT, GREEN, SLATE } from "@/platform/constants";
import { daysUntilExpiry, daysUntilStockout } from "@/platform/utils/dates";
import { fmtK, fmt } from "@/platform/utils/format";
import { getStockStatus, STATUS } from "@/platform/utils/inventoryStatus";
import { Avatar, Badge, BarChart } from "@/platform/components/primitives";
import { buildDailyWhatsappSummary, buildDashboardGreeting, buildDashboardKpis, formatDashboardDate } from "@/platform/features/dashboard/summary";
import { useFinancialSummary } from "@/platform/data/useFinancialSummary";
import { useDashboardKpis } from "@/platform/data/useDashboardKpis";

export default function DashboardScreen({ user, medicines, customers, onNavigate, onShowToast }) {
  const kpisQ = useDashboardKpis();
  const enriched = medicines.map((m) => ({ ...m, status: getStockStatus(m) }));
  const alerts = enriched.filter((m) => ["critical", "low", "expiring"].includes(m.status));
  const totalValue = enriched.reduce((s, m) => s + m.stock * m.unitCost, 0);
  const creditOut = kpisQ.data ? kpisQ.data.outstandingCredit : customers.reduce((s, c) => s + c.creditBalance, 0);
  const dueReminders = customers.filter((c) => c.reminders.some((r) => !r.sent));
  const finQ = useFinancialSummary(30);
  const revenueToday = kpisQ.data?.revenueToday ?? 0;
  const salesCountToday = kpisQ.data?.salesCountToday ?? 0;
  const revenueDaily = (finQ.data?.revenue.daily ?? []).map((d) => d.total);

  const greeting = buildDashboardGreeting();
  const waSummary = buildDailyWhatsappSummary({
    pharmacy: user.pharmacy,
    lowStockCount: alerts.filter((a) => a.status !== "expiring").length,
    creditOut: fmt(creditOut),
    dueRemindersCount: dueReminders.length,
    revenueToday: fmt(revenueToday),
    salesCountToday,
    customersCount: customers.length
  });

  const kpis = buildDashboardKpis({
    userRole: user.role,
    alertsCount: alerts.length,
    criticalAlertsCount: alerts.filter((a) => a.status === "critical").length,
    dueRemindersCount: dueReminders.length,
    creditOutAmount: creditOut,
    customersWithCreditCount: customers.filter((c) => c.creditBalance > 0).length,
    revenueMtd: kpisQ.data ? kpisQ.data.revenueLast30Days : (finQ.data?.revenue.total ?? 0),
    revenueToday,
    salesCountToday
  });

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: SLATE, letterSpacing: "-0.03em" }}>
          {greeting}, {user.name.split(" ")[0]} 👋
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span>{formatDashboardDate()} · Here's what matters today</span>
          {kpisQ.isFetching && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>Syncing…</span>}
          {kpisQ.error && <span style={{ fontSize: 12, color: "#f97316", fontWeight: 800 }}>Using cached data</span>}
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 14, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div
            key={i}
            onClick={() => k.screen && onNavigate(k.screen)}
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: "18px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px #0000000a",
              cursor: k.screen ? "pointer" : "default",
              transition: "all 0.15s",
              position: "relative",
              overflow: "hidden",
              animation: `fadeUp 0.4s ${i * 0.05}s both"}`
            }}
            onMouseEnter={(e) => {
              if (k.screen) e.currentTarget.style.boxShadow = "0 4px 16px #0000001a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 1px 3px #0000000a";
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, borderRadius: "14px 14px 0 0" }} />
            <div style={{ fontSize: 20, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: k.color, letterSpacing: "-0.04em", lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: user.role === "owner" ? "1fr 1fr" : "1fr", gap: 20, marginBottom: 20 }}>
        {/* Priority Actions */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "22px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SLATE, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Priority Actions{" "}
            {alerts.length > 0 && <span style={{ background: "#fef2f2", color: "#ef4444", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99 }}>{alerts.length}</span>}
          </div>
          {alerts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>All stock levels healthy</div>
            </div>
          ) : (
            alerts.slice(0, 4).map((item) => (
              <div
                key={item.id}
                onClick={() => onNavigate("inventory")}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS[item.status].color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: SLATE }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {item.status === "expiring"
                      ? `Expires in ${daysUntilExpiry(item.expiryDate)} days`
                      : `${item.stock} units · ${daysUntilStockout(item.stock, item.dailyVelocity)}d left`}
                  </div>
                </div>
                <Badge status={item.status} />
              </div>
            ))
          )}
          {alerts.length > 4 && (
            <button
              onClick={() => onNavigate("inventory")}
              style={{ width: "100%", marginTop: 10, padding: "9px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
            >
              View all {alerts.length} alerts →
            </button>
          )}
        </div>

        {/* Revenue Chart */}
        {user.role === "owner" && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: SLATE }}>Revenue — Last 30 Days</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: GREEN }}>{fmtK(finQ.data?.revenue.total ?? 0)}</div>
            </div>
            {revenueDaily.some((v) => v > 0) ? (
              <BarChart data={revenueDaily} color={GREEN} height={68} />
            ) : (
              <div style={{ fontSize: 13, color: "#94a3b8", padding: "18px 0" }}>No sales recorded in the last 30 days yet.</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
              {[
                { l: "Gross profit", v: fmtK((finQ.data?.revenue.total ?? 0) - (finQ.data?.cogs.total ?? 0)), c: "#10b981" },
                { l: "Margin", v: `${(finQ.data?.revenue.total ?? 0) > 0 ? Math.round((((finQ.data?.revenue.total ?? 0) - (finQ.data?.cogs.total ?? 0)) / (finQ.data?.revenue.total ?? 1)) * 100) : 0}%`, c: "#3b82f6" },
                { l: "Stock at cost", v: fmtK(finQ.data?.inventory_value.at_cost ?? 0), c: "#8b5cf6" }
              ].map((s, i) => (
                <div key={i} style={{ textAlign: "center", padding: "9px", background: "#f8fafc", borderRadius: 9 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reminders Due + WhatsApp Summary (side by side) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: SLATE }}>🔔 Refill Reminders Due</div>
            <button onClick={() => onNavigate("reminders")} style={{ fontSize: 12, fontWeight: 700, color: GREEN, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>
              View all →
            </button>
          </div>
          {dueReminders.length === 0 ? (
            <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "16px" }}>No reminders due this week ✓</div>
          ) : (
            dueReminders.slice(0, 3).map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f8fafc" }}>
                <Avatar name={`${c.firstName} ${c.lastName}`} size={32} bg={`hsl(${c.id * 60},60%,50%)`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: SLATE }}>
                    {c.firstName} {c.lastName}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {c.reminders[0]?.medicine} · Due {c.reminders[0]?.dueDate}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#25D366", background: "#f0fdf4", padding: "3px 8px", borderRadius: 99 }}>WhatsApp</span>
              </div>
            ))
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "22px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SLATE, marginBottom: 14 }}>📲 Daily WhatsApp Summary</div>
          <div
            style={{
              background: "#f0fdf4",
              borderRadius: 10,
              padding: "12px 14px",
              border: "1px solid #bbf7d0",
              fontFamily: "monospace",
              fontSize: 11,
              color: "#065f46",
              lineHeight: 1.8,
              marginBottom: 14,
              whiteSpace: "pre-line"
            }}
          >
            {waSummary}
          </div>
          <button
            onClick={() => {
              // NevOut Meds does not send messages itself: it hands the text to
              // WhatsApp, and the user sends it.
              navigator.clipboard?.writeText(waSummary);
              window.open(`https://wa.me/?text=${encodeURIComponent(waSummary)}`, "_blank", "noopener");
              onShowToast("Summary copied and WhatsApp opened — send it from there", "success");
            }}
            style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
          >
            Open in WhatsApp to send
          </button>
        </div>
      </div>

      {/* Working capital (owner only) — real figures only. A cash-flow
          projection is not shown because expenses and cash on hand are not
          tracked anywhere in the product yet (Phase 3). */}
      {user.role === "owner" && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 14, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 28 }}>💵</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#065f46" }}>Where your working capital is</div>
            <div style={{ fontSize: 12, color: "#047857", marginTop: 2, lineHeight: 1.6 }}>
              {fmt(creditOut)} is owed to you by customers, and {fmtK(finQ.data?.inventory_value.at_cost ?? 0)} is sitting in stock at cost.
              Collecting credit is the fastest cash you can raise. Expenses and cash on hand are not tracked, so no projection is shown.
            </div>
          </div>
          <button
            onClick={() => onNavigate("financials")}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #6ee7b7", background: "#fff", color: "#047857", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
          >
            View Financials
          </button>
        </div>
      )}
    </div>
  );
}
