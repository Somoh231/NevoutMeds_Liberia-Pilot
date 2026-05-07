import { fmt } from "@/platform/utils/format";

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

export function generateInsights(medicines: any[], customers: any[]): Insight[] {
  const insights: Insight[] = [];

  // ── Inventory Intelligence ───────────────────────────────
  const criticalStock = medicines.filter((m) => m.stock <= m.reorderPoint * 0.4);
  const expiringStock = medicines.filter((m) => {
    const days = Math.ceil((new Date(m.expiryDate).getTime() - new Date().getTime()) / 86400000);
    return days > 0 && days <= 30;
  });
  const overstocked = medicines.filter((m) => m.stock > m.maxStock * 0.9);
  const atRiskValue = expiringStock.reduce((s, m) => s + m.stock * m.unitCost, 0);

  if (criticalStock.length > 0)
    insights.push({
      type: "critical",
      category: "Inventory",
      title: `${criticalStock.length} medicines at critical stock levels`,
      detail: `${criticalStock.map((m) => m.name).join(", ")} will run out within ${Math.min(...criticalStock.map((m) => Math.floor(m.stock / m.dailyVelocity)))} days at current sales rate. These are essential medicines — a stockout means turning patients away.`,
      financial: `Estimated lost revenue from stockouts: ${fmt(
        criticalStock.reduce((s, m) => s + m.reorderPoint * 1.5 * m.sellingPrice, 0)
      )} if not restocked within 48 hours.`,
      recommendation: `Place emergency reorder today for ${criticalStock.map((m) => m.name).join(" and ")}. Use MedSupply West Africa — 2-day delivery. Consider increasing reorder points by 20% for fast-moving essentials.`,
      priority: 1
    });

  if (expiringStock.length > 0)
    insights.push({
      type: "warning",
      category: "Inventory",
      title: `${fmt(atRiskValue)} in stock value at expiry risk`,
      detail: `${expiringStock
        .map((m) => `${m.name} (${Math.ceil((new Date(m.expiryDate).getTime() - new Date().getTime()) / 86400000)}d)`)
        .join(", ")} expire soon. At current velocity you will sell ${expiringStock
        .map((m) => Math.min(m.stock, Math.floor(m.dailyVelocity * 30)))
        .reduce((a, b) => a + b, 0)} units but ${expiringStock
        .map((m) => Math.max(0, m.stock - Math.floor(m.dailyVelocity * 30)))
        .reduce((a, b) => a + b, 0)} units may expire.`,
      financial: `If unsold, you lose ${fmt(atRiskValue)} in inventory value. A 15% discount promotion now would recover ${fmt(atRiskValue * 0.85)} and clear stock before expiry.`,
      recommendation: `Run a 15% discount on ${expiringStock.map((m) => m.name).join(" and ")} this week. Notify loyal customers via WhatsApp. Adjust future order quantities to match 45-day velocity rather than maximum stock.`,
      priority: 2
    });

  if (overstocked.length > 0) {
    const tiedCapital = overstocked.reduce((s, m) => s + (m.stock - m.maxStock * 0.7) * m.unitCost, 0);
    insights.push({
      type: "warning",
      category: "Inventory",
      title: `${fmt(tiedCapital)} in capital tied up in overstock`,
      detail: `${overstocked.map((m) => m.name).join(", ")} are above 90% of max stock. This capital is sitting on your shelves instead of generating returns or paying down supplier debt.`,
      financial: `If you redirected ${fmt(tiedCapital)} from overstock purchases to clearing your overdue debt at 5% interest, you would save ${fmt(tiedCapital * 0.05)} in monthly interest charges.`,
      recommendation: `Reduce next order quantities for ${overstocked.map((m) => m.name).join(" and ")} by 40%. Use freed capital to pay down the overdue Local Distributor debt and eliminate interest charges.`,
      priority: 3
    });
  }

  // ── Customer Intelligence ────────────────────────────────
  const creditCustomers = customers.filter((c) => c.creditBalance > 0);
  const totalCredit = creditCustomers.reduce((s, c) => s + c.creditBalance, 0);
  const highCreditRisk = creditCustomers.filter((c) => c.creditBalance / c.creditLimit > 0.7);

  if (totalCredit > 0)
    insights.push({
      type: "warning",
      category: "Customers",
      title: `${fmt(totalCredit)} in customer credit outstanding`,
      detail: `${creditCustomers.length} customers owe credit. ${
        highCreditRisk.length > 0
          ? `${highCreditRisk.map((c) => `${c.firstName} ${c.lastName}`).join(", ")} are at over 70% of their credit limit — high collection risk.`
          : "Most are within safe limits."
      } Credit extended without collection timelines becomes bad debt.`,
      financial: `If you collect ${fmt(totalCredit)} this month, you can fully cover the overdue supplier debt of $350 and eliminate the 5% monthly interest charge — saving ${fmt(350 * 0.05)} monthly going forward.`,
      recommendation: `Contact ${highCreditRisk.map((c) => c.firstName).join(" and ")} by WhatsApp this week for payment. Set a firm 30-day collection rule going forward. Consider requiring mobile money deposit for first-time credit customers.`,
      priority: 2
    });

  const topCustomers = [...customers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 3);
  const topSpend = topCustomers.reduce((s, c) => s + c.totalSpend, 0);
  const totalSpend = customers.reduce((s, c) => s + c.totalSpend, 0);
  insights.push({
    type: "opportunity",
    category: "Customers",
    title: `Top 3 customers represent ${((topSpend / totalSpend) * 100).toFixed(0)}% of lifetime revenue`,
    detail: `${topCustomers.map((c) => `${c.firstName} ${c.lastName} (${fmt(c.totalSpend)})`).join(", ")} are your most valuable patients. They have chronic conditions requiring regular refills — predictable revenue you can plan around.`,
    financial: `If each top customer visits just once more per month, that's an estimated ${fmt(
      (topCustomers.length * topCustomers.reduce((s, c) => s + c.totalSpend / c.visitCount, 0)) / topCustomers.length
    )} in additional monthly revenue.`,
    recommendation: `Set up recurring refill reminders for all 3. Agnes Freeman's Metformin and Mary Johnson's Metformin are monthly purchases — automate reminders 5 days before expected refill. Consider a loyalty discount of 5% for 10+ visit customers.`,
    priority: 3
  });

  // ── Financial Intelligence ───────────────────────────────
  insights.push({
    type: "opportunity",
    category: "Financials",
    title: "Supplier price gap is costing you ~15% on procurement",
    detail: `You paid $2.80/unit for Artemether from PharmaCorp. HealthBridge Distributors offers the same product at $2.45 — an 12.5% saving. Across your full monthly procurement of ~$1,420, similar gaps likely exist on multiple products.`,
    financial: `A 12% average saving across $1,420 monthly procurement = ${fmt(1420 * 0.12)} saved per month = ${fmt(1420 * 0.12 * 12)} per year. That's nearly 2 months of rent recovered annually just by comparing prices.`,
    recommendation: `Before every reorder, check the Supplier Marketplace tab. Set a rule: always compare at least 2 suppliers for orders above $50. For Artemether specifically, switch to HealthBridge on next order. Track savings in the financials tab monthly.`,
    priority: 2
  });

  insights.push({
    type: "info",
    category: "Financials",
    title: "Margin is healthy but cash flow timing creates risk",
    detail: `Your 55.6% gross margin is above the 45% regional average — well managed. However, your overdue debt ($350) and credit outstanding (${fmt(totalCredit)}) create a cash flow timing mismatch. Inflows are spread across the month but supplier payments cluster at specific dates.`,
    financial: `Current cash on hand: $3,240. Upcoming outflows: $1,370. Comfortable — but the overdue $350 is accruing 5% monthly interest ($17.50/month). Over a year that's ${fmt(350 * 0.05 * 12)} in unnecessary charges.`,
    recommendation: `Pay the $350 overdue balance to Local Distributor immediately — it's the highest-priority debt. Then build a 7-day cash reserve rule: never let cash on hand drop below 1 week of estimated expenses ($500). This prevents future late payment situations.`,
    priority: 2
  });

  // ── Operational Intelligence ─────────────────────────────
  // (kept for future expansion; currently used for messaging)
  medicines.filter((m) => m.category === "Antimalarials");
  insights.push({
    type: "opportunity",
    category: "Operations",
    title: "Malaria season approaching — prepare inventory now",
    detail: `Artemether and Chloroquine are your antimalarials. Malaria season in Liberia peaks May–October. Artemether is already critically low (8 units) with a velocity of 4.1/day. Historical patterns suggest demand increases 60-80% during peak season.`,
    financial: `At 60% increased demand, Artemether velocity rises to ~6.6/day. To cover 30 days you need 200 units. Current stock covers 2 days. Lost malaria sales during stockout = estimated ${fmt(6.6 * 30 * 5.5)} in missed revenue.`,
    recommendation: `Order 200 units of Artemether immediately. Stock up on Chloroquine before May. Consider negotiating a seasonal forward order with HealthBridge for antimalarials at locked pricing — this protects against price spikes during peak season.`,
    priority: 1
  });

  return insights.sort((a, b) => a.priority - b.priority);
}

