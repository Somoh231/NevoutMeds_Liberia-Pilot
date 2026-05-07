import { useState } from "react";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { FINANCIALS } from "@/platform/seed/financials";
import { fmt, fmtK } from "@/platform/utils/format";
import { Avatar, BarChart } from "@/platform/components/primitives";

export default function FinancialsScreen({ customers }) {
  const [tab, setTab] = useState("overview");
  const creditTotal = customers.reduce((s, c) => s + c.creditBalance, 0);
  const cashIn = FINANCIALS.cashflow.inflows.reduce((s, i) => s + i.amount, 0);
  const cashOut = FINANCIALS.cashflow.outflows.reduce((s, o) => s + o.amount, 0);
  const shortfall = cashIn - cashOut;
  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Financial Intelligence</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>April 2026 · Monrovia Central Pharmacy</div>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 22, background: "#f1f5f9", borderRadius: 11, padding: 4, width: "fit-content" }}>
        {["overview", "cashflow", "debt", "expenses", "credit"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: tab === t ? "#fff" : "transparent",
              color: tab === t ? SLATE : "#64748b",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT,
              boxShadow: tab === t ? "0 1px 4px #0000001a" : "none",
              transition: "all 0.15s"
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 22 }}>
            {[
              { l: "Monthly Revenue", v: fmtK(FINANCIALS.revenue.mtd), s: "↑ 22% YoY", c: GREEN },
              { l: "Monthly Expenses", v: fmtK(FINANCIALS.expenses.mtd), s: "of revenue", c: "#f97316" },
              { l: "Net Profit", v: fmtK(FINANCIALS.profit.mtd), s: `${FINANCIALS.profit.margin}% margin`, c: "#3b82f6" },
              { l: "Cash on Hand", v: fmtK(FINANCIALS.cashflow.current), s: "available now", c: "#8b5cf6" },
              { l: "YTD Revenue", v: fmtK(FINANCIALS.revenue.ytd), s: "Jan–Apr 2026", c: GREEN },
              {
                l: "Debt Outstanding",
                v: fmtK(FINANCIALS.debt.total),
                s: `${FINANCIALS.debt.breakdown.filter((d) => d.status === "overdue").length} overdue`,
                c: FINANCIALS.debt.breakdown.some((d) => d.status === "overdue") ? "#ef4444" : "#f59e0b"
              }
            ].map((k, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "18px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px #0000000a" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{k.l}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: k.c, letterSpacing: "-0.04em" }}>{k.v}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{k.s}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: SLATE }}>Daily Revenue — 30 Days</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: GREEN }}>{fmtK(FINANCIALS.revenue.mtd)}</div>
              </div>
              <BarChart data={FINANCIALS.revenue.last30} color={GREEN} height={72} />
            </div>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 14 }}>P&L This Month</div>
              {[
                { l: "Revenue", v: FINANCIALS.revenue.mtd, c: GREEN, pct: 100 },
                { l: "Expenses", v: FINANCIALS.expenses.mtd, c: "#f97316", pct: (FINANCIALS.expenses.mtd / FINANCIALS.revenue.mtd) * 100 },
                { l: "Profit", v: FINANCIALS.profit.mtd, c: "#3b82f6", pct: (FINANCIALS.profit.mtd / FINANCIALS.revenue.mtd) * 100 }
              ].map((r, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{r.l}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: r.c }}>{fmt(r.v, 0)}</span>
                  </div>
                  <div style={{ height: 5, background: "#f1f5f9", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${r.pct}%`, background: r.c, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab === "cashflow" && (
        <div>
          <div style={{ background: shortfall < 0 ? "#fef2f2" : "#f0fdf4", border: `1px solid ${shortfall < 0 ? "#fecaca" : "#bbf7d0"}`, borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 32 }}>{shortfall < 0 ? "⚠️" : "✓"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: shortfall < 0 ? "#7f1d1d" : "#065f46" }}>30-Day Cash Flow {shortfall < 0 ? "Warning" : "Surplus"}</div>
              <div style={{ fontSize: 13, color: shortfall < 0 ? "#b45309" : "#047857", marginTop: 3 }}>
                {shortfall < 0 ? `You are projected ${fmt(Math.abs(shortfall))} short. Prioritise collecting ${fmt(Math.abs(shortfall))} in credit payments this week.` : `You have a projected surplus of ${fmt(shortfall)}. You can safely pay all upcoming supplier debts.`}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: shortfall < 0 ? "#ef4444" : GREEN }}>
                {shortfall < 0 ? "-" : "+"}
                {fmt(Math.abs(shortfall), 0)}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 14 }}>Expected Inflows</div>
              {FINANCIALS.cashflow.inflows.map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f8fafc", fontSize: 13 }}>
                  <span style={{ color: "#334155", fontWeight: 600 }}>{f.label}</span>
                  <span style={{ fontWeight: 800, color: GREEN }}>{fmt(f.amount, 0)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 14, fontWeight: 800 }}>
                <span style={{ color: SLATE }}>Total In</span>
                <span style={{ color: GREEN }}>{fmt(cashIn, 0)}</span>
              </div>
            </div>
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 14 }}>Expected Outflows</div>
              {FINANCIALS.cashflow.outflows.map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f8fafc", fontSize: 13 }}>
                  <span style={{ color: "#334155", fontWeight: 600 }}>{f.label}</span>
                  <span style={{ fontWeight: 800, color: "#f97316" }}>{fmt(f.amount, 0)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 14, fontWeight: 800 }}>
                <span style={{ color: SLATE }}>Total Out</span>
                <span style={{ color: "#ef4444" }}>{fmt(cashOut, 0)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {tab === "debt" && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: SLATE }}>Supplier Debt</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#f97316" }}>{fmt(FINANCIALS.debt.total, 0)} total</div>
          </div>
          {FINANCIALS.debt.breakdown.map((d, i) => (
            <div key={i} style={{ padding: "16px 22px", borderBottom: "1px solid #f8fafc", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: d.status === "overdue" ? "#ef4444" : d.status === "due-soon" ? "#f59e0b" : GREEN, flexShrink: 0, boxShadow: d.status === "overdue" ? "0 0 0 3px #fecaca" : "none" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: SLATE }}>{d.supplier}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>
                  Due: {d.dueDate} · Interest: {d.interest}%
                  {d.daysOverdue > 0 ? ` · ${d.daysOverdue} days OVERDUE` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: d.status === "overdue" ? "#ef4444" : d.status === "due-soon" ? "#f59e0b" : SLATE }}>{fmt(d.amount, 0)}</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: d.status === "overdue" ? "#fef2f2" : d.status === "due-soon" ? "#fffbeb" : "#f0fdf4", color: d.status === "overdue" ? "#ef4444" : d.status === "due-soon" ? "#f59e0b" : GREEN }}>
                  {d.status === "overdue" ? "OVERDUE" : d.status === "due-soon" ? "DUE SOON" : "CURRENT"}
                </span>
              </div>
            </div>
          ))}
          {FINANCIALS.debt.breakdown.some((d) => d.status === "overdue") && (
            <div style={{ padding: "12px 22px", background: "#fef2f2", borderTop: "1px solid #fecaca", fontSize: 12, fontWeight: 600, color: "#dc2626" }}>
              ⚠ Overdue debt accruing interest daily. Contact supplier immediately to avoid supply suspension.
            </div>
          )}
        </div>
      )}
      {tab === "expenses" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 16 }}>Expense Breakdown</div>
            {FINANCIALS.expenses.categories.map((cat, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{cat.name}</span>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: SLATE }}>{fmt(cat.amount, 0)}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>{cat.pct}%</span>
                  </div>
                </div>
                <div style={{ height: 7, background: "#f1f5f9", borderRadius: 99 }}>
                  <div style={{ height: "100%", width: `${cat.pct}%`, background: [GREEN, "#3b82f6", "#f97316", "#8b5cf6"][i], borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 14 }}>Monthly P&L</div>
            {[{ l: "Revenue", v: FINANCIALS.revenue.mtd, c: GREEN, s: "+" }, { l: "Expenses", v: FINANCIALS.expenses.mtd, c: "#ef4444", s: "−" }, { l: "Net Profit", v: FINANCIALS.profit.mtd, c: "#3b82f6", s: "=" }].map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: i < 2 ? "1px solid #f1f5f9" : "2px solid #e2e8f0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 5, background: `${r.c}20`, color: r.c, fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{r.s}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{r.l}</span>
                </div>
                <span style={{ fontSize: 17, fontWeight: 900, color: r.c }}>{fmt(r.v, 0)}</span>
              </div>
            ))}
            <div style={{ marginTop: 14, padding: "12px", background: "#f0fdf4", borderRadius: 9, border: "1px solid #bbf7d0", fontSize: 12, color: "#065f46", fontWeight: 600 }}>✓ {FINANCIALS.profit.margin}% margin — above the 45% regional average.</div>
          </div>
        </div>
      )}
      {tab === "credit" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
            {[{ l: "Credit Outstanding", v: fmt(creditTotal), c: "#f97316" }, { l: "Patients with Credit", v: customers.filter((c) => c.creditBalance > 0).length, c: "#8b5cf6" }, { l: "Avg Balance", v: fmt(creditTotal / Math.max(customers.filter((c) => c.creditBalance > 0).length, 1)), c: "#3b82f6" }].map((s, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 13, padding: "16px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.l}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid #e2e8f0", fontSize: 13, fontWeight: 800, color: SLATE }}>Credit Balances</div>
            {customers
              .filter((c) => c.creditBalance > 0)
              .map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderBottom: "1px solid #f8fafc" }}>
                  <Avatar name={`${c.firstName} ${c.lastName}`} size={34} bg={`hsl(${c.id * 60},60%,50%)`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: SLATE }}>
                      {c.firstName} {c.lastName} · {c.phone}
                    </div>
                    <div style={{ height: 4, background: "#f1f5f9", borderRadius: 99, marginTop: 5, width: 120 }}>
                      <div style={{ height: "100%", width: `${Math.min((c.creditBalance / c.creditLimit) * 100, 100)}%`, background: c.creditBalance / c.creditLimit > 0.8 ? "#ef4444" : "#f97316", borderRadius: 99 }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: "#f97316" }}>{fmt(c.creditBalance)}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{((c.creditBalance / c.creditLimit) * 100).toFixed(0)}% of limit</div>
                  </div>
                  <button style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: GREEN, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Collect</button>
                </div>
              ))}
            {customers.filter((c) => c.creditBalance > 0).length === 0 && <div style={{ padding: "28px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No outstanding credit ✓</div>}
          </div>
        </div>
      )}
    </div>
  );
}

