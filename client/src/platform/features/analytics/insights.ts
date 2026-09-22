import { fmt } from "@/platform/utils/format";
import type { FinancialSummary } from "@/platform/data/useFinancialSummary";

export const INSIGHT_TYPES = {
  critical: { color: "#ef4444", bg: "#fef2f2", border: "#fecaca", icon: "🚨", label: "Critical" },
  warning: { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: "⚠️", label: "Warning" },
  opportunity: { color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0", icon: "💡", label: "Opportunity" },
  info: { color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", icon: "📊", label: "Insight" }
};

export type InsightType = keyof typeof INSIGHT_TYPES;

export type Insight = {
  type: InsightType;
  category: string;
  title: string;
  detail: string;
  financial: string;
  recommendation: string;
  priority: number;
};

// Phase 3: every insight is derived from this pharmacy's own records. Where the
// data does not exist (supplier debt, expenses, interest terms), no insight is
// produced — the engine never invents suppliers, prices, debts or people.
export function generateInsights(medicines: any[], customers: any[], finance?: FinancialSummary | null): Insight[] {
  const insights: Insight[] = [];
  const daysTo = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

  // ── Inventory ────────────────────────────────────────────
  const criticalStock = medicines.filter((m) => m.reorderPoint > 0 && m.stock <= m.reorderPoint * 0.4);
  const expiringStock = medicines.filter((m) => {
    const d = daysTo(m.expiryDate);
    return d > 0 && d <= 30;
  });
  const overstocked = medicines.filter((m) => m.maxStock > 0 && m.stock > m.maxStock * 0.9);
  const atRiskValue = expiringStock.reduce((s, m) => s + m.stock * m.unitCost, 0);

  if (criticalStock.length > 0) {
    const withVelocity = criticalStock.filter((m) => m.dailyVelocity > 0);
    const daysLeft = withVelocity.length ? Math.min(...withVelocity.map((m) => Math.floor(m.stock / m.dailyVelocity))) : null;
    insights.push({
      type: "critical",
      category: "Inventory",
      title: `${criticalStock.length} medicine${criticalStock.length === 1 ? "" : "s"} at critical stock level`,
      detail:
        `${criticalStock.map((m) => `${m.name} (${m.stock} left)`).join(", ")} ` +
        (daysLeft !== null
          ? `will run out in about ${daysLeft} day${daysLeft === 1 ? "" : "s"} at the sales rate recorded in your own stock movements.`
          : `are below 40% of their reorder point. No sales velocity has been recorded yet, so the runway cannot be estimated.`),
      financial: `Refilling to the reorder point would cost about ${fmt(
        criticalStock.reduce((s, m) => s + Math.max(0, m.reorderPoint - m.stock) * m.unitCost, 0)
      )} at your recorded unit costs, and protects ${fmt(
        criticalStock.reduce((s, m) => s + Math.max(0, m.reorderPoint - m.stock) * m.sellingPrice, 0)
      )} of sales at your own selling prices.`,
      recommendation: `Reorder ${criticalStock.map((m) => m.name).join(", ")} now. Compare your saved suppliers on the Suppliers tab before ordering — the cheapest recorded price wins.`,
      priority: 1
    });
  }

  if (expiringStock.length > 0) {
    const willNotSell = expiringStock
      .map((m) => Math.max(0, m.stock - Math.floor((m.dailyVelocity || 0) * daysTo(m.expiryDate))))
      .reduce((a, b) => a + b, 0);
    insights.push({
      type: "warning",
      category: "Inventory",
      title: `${fmt(atRiskValue)} of stock expires within 30 days`,
      detail: `${expiringStock.map((m) => `${m.name} (${daysTo(m.expiryDate)}d, ${m.stock} units)`).join(", ")}. At the velocity recorded for these products, about ${willNotSell} unit${willNotSell === 1 ? "" : "s"} will still be on the shelf at expiry.`,
      financial: `Unsold expiry would write off ${fmt(
        expiringStock.reduce((s, m) => s + Math.max(0, m.stock - Math.floor((m.dailyVelocity || 0) * daysTo(m.expiryDate))) * m.unitCost, 0)
      )} at cost. Selling those units at any price above cost recovers more than discarding them.`,
      recommendation: `Discount the at-risk units this week and tell customers who buy them regularly. Order these products in smaller, more frequent quantities so stock matches shelf life.`,
      priority: 2
    });
  }

  if (overstocked.length > 0) {
    const tiedCapital = overstocked.reduce((s, m) => s + (m.stock - m.maxStock * 0.7) * m.unitCost, 0);
    insights.push({
      type: "warning",
      category: "Inventory",
      title: `${fmt(tiedCapital)} of cash is sitting in overstock`,
      detail: `${overstocked.map((m) => m.name).join(", ")} are above 90% of the maximum stock level you set. That money is on the shelf instead of being available for fast-moving products.`,
      financial: `${fmt(tiedCapital)} is above the level you defined as healthy for these products, valued at your recorded unit cost.`,
      recommendation: `Cut the next order quantity for ${overstocked.map((m) => m.name).join(", ")} until stock falls back toward the reorder point, and put the freed cash into the critical items above.`,
      priority: 3
    });
  }

  // ── Customers ────────────────────────────────────────────
  const creditCustomers = customers.filter((c) => c.creditBalance > 0);
  const totalCredit = creditCustomers.reduce((s, c) => s + c.creditBalance, 0);
  const overLimit = creditCustomers.filter((c) => c.creditLimit > 0 && c.creditBalance > c.creditLimit);

  if (totalCredit > 0) {
    insights.push({
      type: "warning",
      category: "Customers",
      title: `${fmt(totalCredit)} owed to you by ${creditCustomers.length} customer${creditCustomers.length === 1 ? "" : "s"}`,
      detail:
        overLimit.length > 0
          ? `${overLimit.map((c) => `${c.firstName} ${c.lastName} (${fmt(c.creditBalance)} against a ${fmt(c.creditLimit)} limit)`).join(", ")} ${overLimit.length === 1 ? "is" : "are"} past the credit limit you set.`
          : `Every customer on credit is still inside the limit you set for them.`,
      financial: `${fmt(totalCredit)} is money you have already given out as medicine but not yet collected. Collecting it is the cheapest cash you can raise — it costs nothing but a phone call.`,
      recommendation:
        overLimit.length > 0
          ? `Call ${overLimit.map((c) => c.firstName).join(" and ")} first, then agree a payment date before extending more credit.`
          : `Keep to the limits you have set and record every credit sale, so this number stays accurate.`,
      priority: 2
    });
  }

  const spenders = [...customers].filter((c) => c.totalSpend > 0).sort((a, b) => b.totalSpend - a.totalSpend);
  const totalSpend = spenders.reduce((s, c) => s + c.totalSpend, 0);
  if (spenders.length >= 3 && totalSpend > 0) {
    const top = spenders.slice(0, 3);
    const topSpend = top.reduce((s, c) => s + c.totalSpend, 0);
    const avgVisitValue = top.reduce((s, c) => s + (c.visitCount > 0 ? c.totalSpend / c.visitCount : 0), 0) / top.length;
    insights.push({
      type: "opportunity",
      category: "Customers",
      title: `Your top 3 customers are ${((topSpend / totalSpend) * 100).toFixed(0)}% of recorded spend`,
      detail: `${top.map((c) => `${c.firstName} ${c.lastName} (${fmt(c.totalSpend)} over ${c.visitCount} visit${c.visitCount === 1 ? "" : "s"})`).join(", ")}. Losing one of them costs far more than losing an average customer.`,
      financial: `One extra visit each per month is worth about ${fmt(avgVisitValue * top.length)}, based on their own average purchase value.`,
      recommendation: `Set refill reminders for the medicines these customers actually buy, so they do not run out and go elsewhere.`,
      priority: 3
    });
  }

  // ── Financials (only when the database can support the claim) ──
  if (finance && finance.revenue.total > 0) {
    const gross = finance.revenue.total - finance.cogs.total;
    const marginPct = Math.round((gross / finance.revenue.total) * 100);
    const untracked = finance.cogs.untracked_line_items;
    insights.push({
      type: "info",
      category: "Financials",
      title: `Gross margin is ${marginPct}% over the last ${finance.window_days} days`,
      detail:
        `You recorded ${fmt(finance.revenue.total)} of sales across ${finance.revenue.transactions} transaction${finance.revenue.transactions === 1 ? "" : "s"}, at a cost of goods of ${fmt(finance.cogs.total)}.` +
        (untracked > 0 ? ` ${untracked} line item${untracked === 1 ? " was" : "s were"} sold without a linked product, so their cost is not included.` : ""),
      financial: `That leaves ${fmt(gross)} gross profit. Operating expenses are not tracked in NevOut Meds, so this is gross profit, not take-home profit.`,
      recommendation:
        marginPct < 20
          ? `Margin is thin. Compare supplier prices on your worst-margin products and review selling prices before volume grows.`
          : `Hold this margin as volume grows: keep recording every sale against a product, so cost of goods stays accurate.`,
      priority: 2
    });

    const cashInStock = finance.inventory_value.at_cost;
    if (cashInStock > 0 && finance.revenue.total > 0) {
      const daysOfSales = Math.round((cashInStock / (finance.revenue.total / finance.window_days)) * 10) / 10;
      insights.push({
        type: "info",
        category: "Cash flow",
        title: `${fmt(cashInStock)} of cash is held as stock`,
        detail: `At the sales rate of the last ${finance.window_days} days, your current stock represents about ${daysOfSales} days of sales at cost.`,
        financial: `Stock at cost is ${fmt(cashInStock)} and would sell for ${fmt(finance.inventory_value.at_retail)}. Money spent on slow items is money not available for the critical items above.`,
        recommendation: `Aim to hold the fast movers deep and the slow movers thin. Use the expiry and overstock insights above to decide what to cut first.`,
        priority: 3
      });
    }
  }

  return insights.sort((a, b) => a.priority - b.priority);
}
