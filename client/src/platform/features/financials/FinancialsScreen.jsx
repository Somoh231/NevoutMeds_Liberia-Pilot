import { useState } from "react";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { fmt, fmtK } from "@/platform/utils/format";
import { BarChart } from "@/platform/components/primitives";
import { useFinancialSummary } from "@/platform/data/useFinancialSummary";

// Phase 3: every figure below comes from recorded purchases, purchase_items,
// inventory and customer credit for the caller's own pharmacy. Operating
// expenses, cash on hand, supplier debt and payroll are NOT tracked anywhere in
// the product yet, so they are declared as such instead of being invented.
const NOT_TRACKED_COPY = {
  operating_expenses: {
    label: "Operating expenses",
    why: "Rent, salaries, utilities and other outgoings are not recorded in NevOut Meds yet."
  },
  cash_on_hand: {
    label: "Cash on hand",
    why: "There is no till or bank reconciliation, so a cash balance cannot be derived."
  },
  supplier_debt: {
    label: "Supplier debt",
    why: "Purchase orders capture what was ordered, not what has been paid."
  },
  payroll: { label: "Payroll", why: "Staff pay is not recorded in the system." }
};

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "18px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px #0000000a" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, letterSpacing: "-0.04em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function FinancialsScreen({ customers }) {
  const [tab, setTab] = useState("overview");
  const summaryQ = useFinancialSummary(30);
  const s = summaryQ.data;

  const revenue = s?.revenue.total ?? 0;
  const cogs = s?.cogs.total ?? 0;
  const grossProfit = revenue - cogs;
  const marginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;
  const creditOutstanding = s?.credit.outstanding ?? customers.reduce((acc, c) => acc + c.creditBalance, 0);
  const dailySeries = (s?.revenue.daily ?? []).map((d) => d.total);
  const untracked = s?.not_tracked ?? Object.keys(NOT_TRACKED_COPY);

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Financial Intelligence</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
          Last {s?.window_days ?? 30} days · from recorded sales
          {summaryQ.isFetching && <span style={{ color: "#94a3b8", fontWeight: 700 }}> · Syncing…</span>}
          {summaryQ.error && <span style={{ color: "#f97316", fontWeight: 800 }}> · Could not load financials</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 22, background: "#f1f5f9", borderRadius: 11, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
        {["overview", "revenue", "credit", "inventory"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: tab === t ? "#fff" : "transparent", color: tab === t ? SLATE : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, boxShadow: tab === t ? "0 1px 4px #0000001a" : "none" }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 22 }}>
            <Kpi label={`Revenue (${s?.window_days ?? 30}d)`} value={fmtK(revenue)} sub={`${s?.revenue.transactions ?? 0} sales recorded`} color={GREEN} />
            <Kpi label="Revenue today" value={fmt(s?.revenue.today ?? 0)} sub="sales recorded today" color={GREEN} />
            <Kpi label="Cost of goods sold" value={fmtK(cogs)} sub={s?.cogs.untracked_line_items ? `${s.cogs.untracked_line_items} line(s) without a product` : "from recorded line items"} color="#f97316" />
            <Kpi label="Gross profit" value={fmtK(grossProfit)} sub={`${marginPct}% gross margin`} color="#3b82f6" />
            <Kpi label="Credit outstanding" value={fmt(creditOutstanding)} sub={`${s?.credit.customers ?? 0} customers owing`} color="#f59e0b" />
            <Kpi label="Stock value (cost)" value={fmtK(s?.inventory_value.at_cost ?? 0)} sub={`${fmtK(s?.inventory_value.at_retail ?? 0)} at retail`} color="#8b5cf6" />
          </div>

          <div style={{ background: "#fff8ed", border: "1px solid #fed7aa", borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#9a3412" }}>Not tracked yet — deliberately blank</div>
            <div style={{ fontSize: 12, color: "#9a3412", marginTop: 4, lineHeight: 1.6 }}>
              NevOut Meds will not show a number it cannot derive from your records. These need new workflows before they can be reported:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 12 }}>
              {untracked.map((k) => (
                <div key={k} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid #fed7aa" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: SLATE }}>{NOT_TRACKED_COPY[k]?.label ?? k}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, lineHeight: 1.5 }}>{NOT_TRACKED_COPY[k]?.why ?? "Not recorded in the system yet."}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "revenue" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Daily revenue</div>
            {dailySeries.some((v) => v > 0) ? (
              <BarChart data={dailySeries} color={GREEN} height={90} />
            ) : (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>No sales recorded in this period yet.</div>
            )}
          </div>
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: SLATE, marginBottom: 12 }}>How customers paid</div>
            {(s?.revenue.by_method ?? []).length === 0 && <div style={{ fontSize: 13, color: "#94a3b8" }}>No payments recorded yet.</div>}
            {(s?.revenue.by_method ?? []).map((m) => (
              <div key={m.method} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                <span style={{ color: "#64748b", fontWeight: 700 }}>{m.method}</span>
                <span style={{ color: "#94a3b8" }}>{m.count} sales</span>
                <span style={{ fontWeight: 800, color: SLATE }}>{fmt(m.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "credit" && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Credit owed to the pharmacy</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
            {fmt(creditOutstanding)} outstanding across {s?.credit.customers ?? 0} customers
          </div>
          {(s?.credit.over_limit ?? []).length > 0 ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#b91c1c", marginBottom: 8 }}>Over their credit limit — collect first</div>
              {s.credit.over_limit.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: SLATE }}>{c.name}</span>
                  <span style={{ color: "#94a3b8" }}>limit {fmt(c.limit)}</span>
                  <span style={{ fontWeight: 800, color: "#ef4444" }}>{fmt(c.balance)}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#64748b" }}>No customer is over their credit limit.</div>
          )}
        </div>
      )}

      {tab === "inventory" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
          <Kpi label="Stock value at cost" value={fmtK(s?.inventory_value.at_cost ?? 0)} sub="what you paid for stock on hand" color="#8b5cf6" />
          <Kpi label="Stock value at retail" value={fmtK(s?.inventory_value.at_retail ?? 0)} sub="what it sells for" color={GREEN} />
          <Kpi
            label="Potential gross profit"
            value={fmtK((s?.inventory_value.at_retail ?? 0) - (s?.inventory_value.at_cost ?? 0))}
            sub="if all current stock sells at list price"
            color="#3b82f6"
          />
        </div>
      )}
    </div>
  );
}
