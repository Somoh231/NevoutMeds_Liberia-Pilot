import { useState } from "react";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { fmt, fmtK } from "@/platform/utils/format";
import { daysUntilExpiry } from "@/platform/utils/dates";
import { getStockStatus, STATUS } from "@/platform/utils/inventoryStatus";
import { INSIGHT_TYPES, generateInsights } from "@/platform/features/analytics/insights";
import { buildAnalyticsCsv, buildAnalyticsReportText } from "@/platform/features/analytics/exports";
import { Badge, BarChartSimple } from "@/platform/components/primitives";

export default function AnalyticsScreen({ medicines, customers }) {
  const [activeSection, setActiveSection] = useState("insights");
  const [expandedInsight, setExpandedInsight] = useState(null);
  const insights = generateInsights(medicines, customers);

  const allPurchases = customers.flatMap((c) => c.purchases || []);
  const revenueByDay = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const buckets = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().split("T")[0];
      buckets.set(key, 0);
    }
    for (const p of allPurchases) {
      const key = String(p.date || "").slice(0, 10);
      if (!buckets.has(key)) continue;
      buckets.set(key, (buckets.get(key) || 0) + Number(p.amount || 0));
    }
    return Array.from(buckets.entries()).map(([day, amount]) => ({ day, amount }));
  };

  const rev7 = revenueByDay(7);
  const rev30 = revenueByDay(30);
  const revenue7Total = rev7.reduce((s, r) => s + r.amount, 0);
  const revenue30Total = rev30.reduce((s, r) => s + r.amount, 0);

  const paymentCounts = allPurchases.reduce((acc, p) => {
    const k = p.method || "Unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const parseItem = (s) => {
    const m = String(s || "").match(/^(.*)\\s+x(\\d+)$/i);
    if (!m) return { name: String(s || "").trim(), qty: 1 };
    return { name: m[1].trim(), qty: parseInt(m[2], 10) || 1 };
  };

  const topSelling = (() => {
    const byName = new Map();
    for (const p of allPurchases) {
      const { name, qty } = parseItem(p.items);
      if (!name) continue;
      byName.set(name, (byName.get(name) || 0) + qty);
    }
    return Array.from(byName.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
  })();

  const riskNow = medicines
    .map((m) => ({ m, status: getStockStatus(m), expDays: daysUntilExpiry(m.expiryDate) }))
    .reduce(
      (acc, x) => {
        if (x.status === "critical") acc.critical++;
        if (x.status === "low") acc.low++;
        if (x.status === "expiring" || x.expDays <= 30) acc.expiryRisk++;
        return acc;
      },
      { critical: 0, low: 0, expiryRisk: 0 }
    );

  const exportReport = () => {
    const content = buildAnalyticsReportText(medicines, customers, insights);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nevoutmeds_analytics_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const csv = buildAnalyticsCsv(medicines, customers);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nevoutmeds_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalStockValue = medicines.reduce((s, m) => s + m.stock * m.unitCost, 0);
  const totalCredit = customers.reduce((s, c) => s + c.creditBalance, 0);
  const criticalCount = insights.filter((i) => i.type === "critical").length;
  const opportunityCount = insights.filter((i) => i.type === "opportunity").length;

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto", fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Advanced Analytics</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>What's really happening · How it affects you · What to do next</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportCSV} style={{ padding: "9px 16px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
            ⬇ Export CSV
          </button>
          <button onClick={exportReport} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
            📄 Download Full Report
          </button>
        </div>
      </div>

      {/* High-level scorecard */}
      <div style={{ background: "linear-gradient(135deg,#020617,#0c1a2e,#064e3b)", borderRadius: 16, padding: "24px", marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 20 }}>
        {[
          { l: "Revenue (7d)", v: fmt(revenue7Total, 0), s: "from recorded purchases", c: "#6ee7b7" },
          { l: "Net Margin", v: "55.6%", s: "Above regional avg", c: "#6ee7b7" },
          { l: "Revenue (30d)", v: fmt(revenue30Total, 0), s: "from recorded purchases", c: "#93c5fd" },
          { l: "Inventory", v: fmtK(totalStockValue), s: "at cost", c: "#c4b5fd" },
          { l: "Credit Risk", v: fmt(totalCredit), s: `${customers.filter((c) => c.creditBalance > 0).length} customers`, c: "#fcd34d" },
          { l: "Inventory Risk", v: `${riskNow.critical + riskNow.low}`, s: `${riskNow.expiryRisk} expiry risk`, c: riskNow.critical > 0 ? "#fca5a5" : "#6ee7b7" }
        ].map((s, i) => (
          <div key={i}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.c, letterSpacing: "-0.04em" }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{s.s}</div>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 22, background: "#f1f5f9", borderRadius: 11, padding: 4, width: "fit-content" }}>
        {[
          ["insights", "🧠 Insights & Actions"],
          ["performance", "📈 Performance"],
          ["products", "💊 Product Analytics"],
          ["customers", "👥 Customer Analytics"]
        ].map(([v, l]) => (
          <button key={v} onClick={() => setActiveSection(v)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: activeSection === v ? "#fff" : "transparent", color: activeSection === v ? SLATE : "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, boxShadow: activeSection === v ? "0 1px 4px #0000001a" : "none", transition: "all 0.15s", whiteSpace: "nowrap" }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── INSIGHTS TAB ── */}
      {activeSection === "insights" && (
        <div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18, padding: "14px 18px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", lineHeight: 1.6 }}>
            <strong style={{ color: SLATE }}>How to read these insights:</strong> Each insight tells you what's happening in your business, how it directly affects your money, and exactly what action to take. Prioritised by urgency — start at the top.
          </div>

          {insights.map((ins, i) => {
            const cfg = INSIGHT_TYPES[ins.type];
            const expanded = expandedInsight === i;
            return (
              <div key={i} onClick={() => setExpandedInsight(expanded ? null : i)} style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${expanded ? cfg.color : "#e2e8f0"}`, marginBottom: 12, overflow: "hidden", cursor: "pointer", transition: "all 0.2s", boxShadow: expanded ? `0 4px 20px ${cfg.color}20` : "0 1px 3px #0000000a", animation: `fadeUp 0.3s ${i * 0.05}s both` }}>
                {/* Header */}
                <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cfg.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: cfg.bg, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{cfg.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", background: "#f1f5f9", padding: "2px 8px", borderRadius: 99 }}>{ins.category}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: SLATE, lineHeight: 1.3 }}>{ins.title}</div>
                  </div>
                  <div style={{ fontSize: 18, color: "#94a3b8", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>⌄</div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{ borderTop: `1px solid ${cfg.border}`, background: cfg.bg }}>
                    {/* What is happening */}
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${cfg.border}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>📋 What is happening</div>
                      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>{ins.detail}</div>
                    </div>
                    {/* Financial impact */}
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${cfg.border}`, background: "#fff" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>💰 How this affects your finances</div>
                      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>{ins.financial}</div>
                    </div>
                    {/* Recommendation */}
                    <div style={{ padding: "16px 20px", background: cfg.bg }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>✅ Recommended action</div>
                      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7, fontWeight: 500 }}>{ins.recommendation}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── PERFORMANCE TAB ── */}
      {activeSection === "performance" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginBottom: 18 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: SLATE }}>Revenue — Last 7 Days</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: GREEN }}>{fmt(revenue7Total, 0)}</div>
              </div>
              <BarChartSimple data={rev7.map((r) => r.amount)} color={GREEN} height={80} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
                <span>{rev7[0]?.day}</span>
                <span>{rev7[rev7.length - 1]?.day}</span>
              </div>
            </div>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Purchases by Payment Method (30d)</div>
              {Object.keys(paymentCounts).length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: 12 }}>No purchases recorded yet.</div>
              ) : (
                Object.entries(paymentCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([k, v], i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{k}</span>
                        <span style={{ fontSize: 12, fontWeight: 900, color: SLATE }}>{v}</span>
                      </div>
                      <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99 }}>
                        <div style={{ height: "100%", width: `${(v / Math.max(...Object.values(paymentCounts))) * 100}%`, background: i === 0 ? GREEN : "#94a3b8", borderRadius: 99 }} />
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {[{ l: "Best Day", v: "Sunday", s: "$310 avg", c: "#10b981", icon: "🏆" }, { l: "Slowest Day", v: "Tuesday", s: "$165 avg", c: "#f97316", icon: "📉" }, { l: "Avg Transaction", v: "$13.80", s: "per customer", c: "#3b82f6", icon: "💳" }, { l: "Customers / Day", v: "~31", s: "weekday average", c: "#8b5cf6", icon: "👥" }].map((s, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 13, padding: "16px 18px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{s.l}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.s}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {activeSection === "products" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginBottom: 18 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Top Selling Medicines (by qty)</div>
              {topSelling.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: 12 }}>No purchases recorded yet.</div>
              ) : (
                topSelling.slice(0, 6).map((t, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f8fafc", fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: "#334155" }}>{t.name}</span>
                    <span style={{ fontWeight: 900, color: GREEN }}>{t.qty}</span>
                  </div>
                ))
              )}
            </div>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Revenue Trend (30d)</div>
              <BarChartSimple data={rev30.map((r) => r.amount)} color={GREEN} height={80} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
                <span>{rev30[0]?.day}</span>
                <span>{rev30[rev30.length - 1]?.day}</span>
              </div>
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: 18 }}>
            <div style={{ padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 0.8fr 1fr 1fr", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", gap: 8 }}>
              <span>Medicine</span>
              <span>Stock</span>
              <span>Velocity</span>
              <span>Margin</span>
              <span>Monthly Revenue</span>
              <span>Performance</span>
            </div>
            {medicines.map((m, i) => {
              const margin = ((m.sellingPrice - m.unitCost) / m.sellingPrice * 100).toFixed(0);
              const monthlyRev = m.dailyVelocity * 30 * m.sellingPrice;
              const score = margin > 50 && m.dailyVelocity > 2 ? "Star" : margin < 30 ? "Low Margin" : m.dailyVelocity < 1 ? "Slow Mover" : "Steady";
              const scoreColor = score === "Star" ? GREEN : score === "Low Margin" ? "#ef4444" : score === "Slow Mover" ? "#f59e0b" : "#3b82f6";
              return (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 0.8fr 1fr 1fr", padding: "12px 20px", borderBottom: "1px solid #f8fafc", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, display: "flex", alignItems: "center", gap: 6 }}>{m.isEssential && <span style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN, flexShrink: 0 }} />}{m.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{m.brand} · {m.category}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: m.stock <= m.reorderPoint ? "#ef4444" : SLATE }}>{m.stock}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#3b82f6" }}>{m.dailyVelocity}/day</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: parseFloat(margin) >= 50 ? GREEN : parseFloat(margin) < 30 ? "#ef4444" : "#f59e0b" }}>{margin}%</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: SLATE }}>{fmt(monthlyRev, 0)}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor, background: `${scoreColor}12`, border: `1px solid ${scoreColor}25`, padding: "3px 8px", borderRadius: 999 }}>{score}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{((m.sellingPrice - m.unitCost) / m.sellingPrice * 100).toFixed(0)}% gross</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Top Revenue Products</div>
              {medicines
                .map((m) => ({ m, monthlyRev: m.dailyVelocity * 30 * m.sellingPrice }))
                .sort((a, b) => b.monthlyRev - a.monthlyRev)
                .slice(0, 5)
                .map(({ m, monthlyRev }, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f8fafc", fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: "#334155" }}>{m.name}</span>
                    <span style={{ fontWeight: 900, color: GREEN }}>{fmt(monthlyRev, 0)}</span>
                  </div>
                ))}
            </div>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Risk Watchlist</div>
              {medicines
                .map((m) => ({ m, status: getStockStatus(m), expDays: daysUntilExpiry(m.expiryDate) }))
                .filter((x) => ["critical", "low", "expiring"].includes(x.status) || x.expDays <= 30)
                .sort((a, b) => (STATUS[a.status]?.priority ?? 9) - (STATUS[b.status]?.priority ?? 9))
                .slice(0, 6)
                .map(({ m, status, expDays }, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f8fafc" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: SLATE }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {m.stock} units · expires in {expDays}d
                      </div>
                    </div>
                    <Badge status={status} />
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOMERS TAB ── */}
      {activeSection === "customers" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Top Customers by Spend</div>
            {customers
              .slice()
              .sort((a, b) => b.totalSpend - a.totalSpend)
              .slice(0, 6)
              .map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f8fafc" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: SLATE }}>{c.firstName} {c.lastName}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.phone} · {c.community}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: GREEN }}>{fmt(c.totalSpend)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.visitCount} visits</div>
                  </div>
                </div>
              ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Credit Exposure</div>
            {customers
              .filter((c) => c.creditBalance > 0)
              .sort((a, b) => b.creditBalance - a.creditBalance)
              .slice(0, 8)
              .map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f8fafc" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: SLATE }}>{c.firstName} {c.lastName}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>Limit {fmt(c.creditLimit)} · {c.phone}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#f97316" }}>{fmt(c.creditBalance)}</span>
                </div>
              ))}
            {customers.filter((c) => c.creditBalance > 0).length === 0 && <div style={{ fontSize: 13, color: "#94a3b8" }}>No outstanding credit balances.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

