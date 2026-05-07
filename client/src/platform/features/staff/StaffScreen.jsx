import { useState } from "react";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { STAFF_DATA } from "@/platform/seed/staff";
import { fmt, fmtK } from "@/platform/utils/format";
import { Avatar } from "@/platform/components/primitives";

export default function StaffScreen({ onShowToast }) {
  const [selected, setSelected] = useState(null);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const totSales = STAFF_DATA.reduce((s, st) => s + st.sales.reduce((a, b) => a + b, 0), 0);

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Staff Performance</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Last 7 days · Know your team from anywhere</div>
      </div>

      {/* Team Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        {[{ l: "Team Revenue (7d)", v: fmtK(totSales), c: GREEN }, { l: "Total Transactions", v: STAFF_DATA.reduce((s, st) => s + st.transactions.reduce((a, b) => a + b, 0), 0), c: "#3b82f6" }, { l: "Active Staff", v: STAFF_DATA.length, c: "#8b5cf6" }].map((s, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 13, padding: "18px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Staff Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16, marginBottom: 20 }}>
        {STAFF_DATA.map((st, i) => {
          const weekTotal = st.sales.reduce((a, b) => a + b, 0);
          const weekTx = st.transactions.reduce((a, b) => a + b, 0);
          const pct = Math.round((weekTotal / totSales) * 100);
          return (
            <div key={st.id} onClick={() => setSelected(selected?.id === st.id ? null : st)} style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${selected?.id === st.id ? "#10b981" : "#e2e8f0"}`, padding: "20px", cursor: "pointer", transition: "all 0.15s", boxShadow: selected?.id === st.id ? "0 4px 16px #10b98115" : "0 1px 3px #0000000a", animation: `fadeUp 0.3s ${i * 0.08}s both` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <Avatar name={st.name} size={44} bg={i === 0 ? "#10b981" : i === 1 ? "#3b82f6" : "#8b5cf6"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: SLATE }}>{st.name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{st.role.charAt(0).toUpperCase() + st.role.slice(1)} · Since {st.since}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: GREEN }}>{fmtK(weekTotal)}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{pct}% of team</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[{ l: "Transactions", v: weekTx, c: "#3b82f6" }, { l: "Avg Sale", v: fmt(weekTotal / weekTx), c: "#8b5cf6" }, { l: "Daily Avg", v: fmtK(weekTotal / 7), c: GREEN }].map((s, j) => (
                  <div key={j} style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 }}>{s.l}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Daily Sales (this week)</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 40 }}>
                {st.sales.map((v, j) => {
                  const max = Math.max(...st.sales);
                  return (
                    <div key={j} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ width: "100%", background: j === 6 ? (i === 0 ? GREEN : i === 1 ? "#3b82f6" : "#8b5cf6") : `${i === 0 ? GREEN : i === 1 ? "#3b82f6" : "#8b5cf6"}50`, borderRadius: "3px 3px 0 0", height: `${(v / max) * 36}px`, minHeight: 4 }} />
                      <span style={{ fontSize: 8, color: "#94a3b8" }}>{days[j]}</span>
                    </div>
                  );
                })}
              </div>
              {selected?.id === st.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Daily Breakdown</div>
                  {st.sales.map((v, j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12 }}>
                      <span style={{ color: "#64748b" }}>{days[j]}</span>
                      <span style={{ fontWeight: 700, color: SLATE }}>{fmt(v, 0)}</span>
                      <span style={{ color: "#94a3b8" }}>{st.transactions[j]} sales</span>
                      <span style={{ color: "#64748b" }}>avg {fmt(st.avgSale[j])}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Shift Report */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SLATE }}>End of Day Report — Today</div>
          <button onClick={() => onShowToast("Shift report sent to John Kamara ✓", "success")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            📲 Send to Owner
          </button>
        </div>
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px", fontFamily: "monospace", fontSize: 12, color: "#334155", lineHeight: 1.9, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 800, color: SLATE, marginBottom: 4 }}>*Nevoutmeds Shift Report — Wed 22 Apr*</div>
          {STAFF_DATA.map((st, i) => (
            <div key={i}>
              • {st.name}: {fmt(st.sales[6], 0)} · {st.transactions[6]} transactions
            </div>
          ))}
          <div style={{ marginTop: 4, color: "#10b981", fontWeight: 700 }}>✓ Team total: {fmt(STAFF_DATA.reduce((s, st) => s + st.sales[6], 0), 0)}</div>
        </div>
      </div>
    </div>
  );
}

