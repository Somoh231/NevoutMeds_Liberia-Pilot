import { fmt } from "@/platform/utils/format";
import type { FinancialSummary } from "@/platform/data/useFinancialSummary";
import { toProductView } from "@/platform/features/inventory/model";

export const INSIGHT_TYPES = {
  critical: { color: "#b42318", bg: "#fdecea", border: "#f4b8b1", icon: "", label: "Act now", tone: "danger" },
  warning: { color: "#8a4b00", bg: "#fff3e0", border: "#f3cf98", icon: "", label: "Watch", tone: "warning" },
  opportunity: { color: "#0b6b50", bg: "#e4f3ec", border: "#b9ddcc", icon: "", label: "Opportunity", tone: "brand" },
  info: { color: "#1d4ed8", bg: "#eaf1ff", border: "#b9ccf5", icon: "", label: "Good to know", tone: "info" }
} as const;

export type InsightType = keyof typeof INSIGHT_TYPES;

/**
 * One finding, written the way an operations manager would brief the owner.
 *  title          — what happened
 *  detail         — why it matters (the specifics)
 *  recommendation — what to do
 *  financial      — estimated effect, from recorded costs and prices only
 *  evidence       — where the numbers come from
 *  target         — where in the app to act on it
 */
export type Insight = {
  id: string;
  type: InsightType;
  category: string;
  title: string;
  detail: string;
  financial: string;
  recommendation: string;
  evidence: string;
  target?: { screen: string; params?: Record<string, string>; label: string };
  priority: number;
};

type Context = {
  suppliers?: Array<{ id: string; name: string; leadDays: number | null }>;
  catalogue?: Array<{ supplierId: string; productName: string; unitCost: number }>;
};

const list = (names: string[], n = 3) => names.slice(0, n).join(", ") + (names.length > n ? ` and ${names.length - n} more` : "");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Phase 3 rule, kept: every insight is derived from this pharmacy's own
// records. Where the data does not exist (supplier debt, expenses, interest
// terms, benchmarks), no insight is produced — nothing is invented.
export function generateInsights(medicines: any[], customers: any[], finance?: FinancialSummary | null, ctx: Context = {}): Insight[] {
  const insights: Insight[] = [];
  const products = medicines.map(toProductView);
  const suppliers = new Map((ctx.suppliers ?? []).map((s) => [String(s.id), s]));

  // ── Stock-out risk ───────────────────────────────────────
  const critical = products.filter((p) => p.status === "out" || p.status === "critical");
  if (critical.length > 0) {
    const withRate = critical.filter((p) => p.daysOfStock !== null);
    const soonest = withRate.length ? Math.min(...withRate.map((p) => p.daysOfStock as number)) : null;
    const cost = critical.reduce((s, p) => s + p.suggestedReorderCost, 0);
    const protectedSales = critical.reduce((s, p) => s + p.suggestedReorder * p.sellingPrice, 0);
    insights.push({
      id: "stockout",
      type: "critical",
      category: "Stock",
      title: `${plural(critical.length, "medicine")} out of stock or critically low`,
      detail: `${list(critical.map((p) => `${p.name} (${p.stock} left)`))}. ${soonest !== null ? `The first will run out in about ${plural(soonest, "day")} at its recorded sales rate.` : "No sales rate is recorded for these, so the runway can’t be estimated."} Customers who can’t get a medicine here buy it elsewhere.`,
      financial: cost > 0 ? `Restocking to your maximum levels costs about ${fmt(cost)} at recorded unit costs and supports ${fmt(protectedSales)} of sales at your selling prices.` : "Set maximum stock levels on these products to size the reorder.",
      recommendation: `Reorder ${list(critical.map((p) => p.name))} today — compare recorded supplier prices first.`,
      evidence: "Stock on hand, reorder points and sales rates recorded on each product.",
      target: { screen: "inventory", params: { filter: "attention" }, label: "Open stock that needs attention" },
      priority: 1
    });
  }

  // ── Reorder timing vs supplier lead time ─────────────────
  const late = products.filter((p) => {
    const s = p.supplierId ? suppliers.get(p.supplierId) : null;
    return s?.leadDays != null && p.daysOfStock !== null && p.stock > 0 && p.daysOfStock <= s.leadDays && p.status !== "out";
  });
  if (late.length > 0) {
    insights.push({
      id: "leadtime",
      type: "critical",
      category: "Stock",
      title: `${plural(late.length, "product")} will run out before a new order can arrive`,
      detail: `${list(late.map((p) => `${p.name}: ${p.daysOfStock} days left, supplier lead time ${suppliers.get(p.supplierId!)!.leadDays} days`))}.`,
      financial: `Ordering today is the earliest you can avoid a gap; the shortfall grows each day you wait.`,
      recommendation: `Order these today, or ask the supplier for a faster delivery.`,
      evidence: "Days of stock (stock ÷ recorded sales rate) against each product’s supplier lead time.",
      target: { screen: "suppliers", params: { compareProductId: late[0].id }, label: "Compare and order" },
      priority: 1
    });
  }

  // ── Expiry exposure ──────────────────────────────────────
  const expiring = products.filter((p) => ["expired", "urgent", "d30"].includes(p.expiry) && p.stock > 0);
  if (expiring.length > 0) {
    const atRiskUnits = expiring.reduce((s, p) => s + p.unitsAtRiskAtExpiry, 0);
    const atRiskValue = expiring.reduce((s, p) => s + p.valueAtRiskAtExpiry, 0);
    insights.push({
      id: "expiry",
      type: "warning",
      category: "Expiry",
      title: `${plural(expiring.length, "product")} expire within 30 days`,
      detail: `${list(expiring.map((p) => `${p.name} (${p.expiry === "expired" ? "expired" : `${p.expiryDays} d`}, ${p.stock} ${p.unit})`))}. At recorded sales rates about ${atRiskUnits} unit${atRiskUnits === 1 ? "" : "s"} will still be on the shelf at expiry.`,
      financial: atRiskValue > 0 ? `Up to ${fmt(atRiskValue)} at cost could be written off.` : "Recorded sales rates suggest these will sell in time.",
      recommendation: `Dispense these batches first and hold further orders for them until they sell. Remove expired stock from sale and record the write-off.`,
      evidence: "Expiry dates, stock on hand and recorded sales rates.",
      target: { screen: "expiry", label: "Open expiry alerts" },
      priority: 2
    });
  }

  // ── Slow stock / overstock (capital tied up) ─────────────
  const slow = products.filter((p) => p.stock > 0 && ((p.daysOfStock !== null && p.daysOfStock > 120) || p.status === "overstock"));
  if (slow.length > 0) {
    const tied = slow.reduce((s, p) => s + (p.status === "overstock" ? (p.stock - p.maxStock) * p.unitCost : p.valueAtCost), 0);
    insights.push({
      id: "slow",
      type: "warning",
      category: "Cash",
      title: `${fmt(tied)} is tied up in slow or excess stock`,
      detail: `${list(slow.map((p) => `${p.name} (${p.daysOfStock !== null ? `${p.daysOfStock} days of stock` : "above maximum"})`))}. That money is on the shelf instead of available for items that sell.`,
      financial: `${fmt(tied)} at recorded unit cost.`,
      recommendation: `Cut the next order for these until stock comes down; put the cash into the critical items first.`,
      evidence: "Stock on hand, recorded sales rates and the maximum stock you set.",
      target: { screen: "inventory", params: { filter: "overstock" }, label: "Review in Inventory" },
      priority: 3
    });
  }

  // ── Supplier savings ─────────────────────────────────────
  const savings = products
    .map((p) => {
      const best = (ctx.catalogue ?? []).filter((c) => c.productName.trim().toLowerCase() === p.name.trim().toLowerCase() && c.unitCost > 0).sort((a, b) => a.unitCost - b.unitCost)[0];
      return best && p.unitCost > best.unitCost ? { p, best, perUnit: p.unitCost - best.unitCost } : null;
    })
    .filter(Boolean) as Array<{ p: ReturnType<typeof toProductView>; best: { supplierId: string; unitCost: number }; perUnit: number }>;
  if (savings.length > 0) {
    const onNextOrder = savings.reduce((s, x) => s + x.perUnit * (x.p.suggestedReorder || x.p.reorderPoint || 0), 0);
    insights.push({
      id: "savings",
      type: "opportunity",
      category: "Buying",
      title: `A cheaper recorded price exists for ${plural(savings.length, "product")}`,
      detail: `${list(savings.map((x) => `${x.p.name}: ${fmt(x.best.unitCost)} vs ${fmt(x.p.unitCost)} now`))}.`,
      financial: onNextOrder > 0 ? `About ${fmt(onNextOrder)} saved on the next order at suggested quantities, before delivery costs.` : "Savings apply from the next order.",
      recommendation: `Check the price is still current, then order from the cheaper supplier.`,
      evidence: "Supplier prices you recorded, against each product’s current unit cost.",
      target: { screen: "suppliers", params: { compareProductId: savings[0].p.id }, label: "Compare prices" },
      priority: 2
    });
  }

  // ── Sales movement (week on week) ────────────────────────
  const daily = finance?.revenue.daily ?? [];
  if (daily.length >= 14) {
    const last7 = daily.slice(-7).reduce((s, d) => s + Number(d.total || 0), 0);
    const prev7 = daily.slice(-14, -7).reduce((s, d) => s + Number(d.total || 0), 0);
    if (prev7 > 0 && last7 >= 0) {
      const change = Math.round(((last7 - prev7) / prev7) * 100);
      if (Math.abs(change) >= 25) {
        insights.push({
          id: "sales-change",
          type: change < 0 ? "warning" : "info",
          category: "Sales",
          title: `Sales are ${change < 0 ? "down" : "up"} ${Math.abs(change)}% on the previous week`,
          detail: `${fmt(last7)} in the last 7 days against ${fmt(prev7)} the 7 days before.`,
          financial: `A difference of ${fmt(Math.abs(last7 - prev7))} in a week.`,
          recommendation: change < 0 ? `Check for stock-outs on your best sellers and whether regular customers are due refills.` : `Check stock on the products driving the increase so they don’t run out.`,
          evidence: "Recorded sales per day (server summary).",
          target: { screen: "reports", label: "Open sales report" },
          priority: change < 0 ? 2 : 3
        });
      }
    }
  }

  // ── Customer credit ──────────────────────────────────────
  const creditCustomers = customers.filter((c) => c.creditBalance > 0);
  const totalCredit = creditCustomers.reduce((s, c) => s + c.creditBalance, 0);
  const overLimit = creditCustomers.filter((c) => c.creditLimit > 0 && c.creditBalance > c.creditLimit);
  if (totalCredit > 0) {
    const top = [...creditCustomers].sort((a, b) => b.creditBalance - a.creditBalance);
    const topShare = Math.round((top[0].creditBalance / totalCredit) * 100);
    insights.push({
      id: "credit",
      type: overLimit.length ? "warning" : "info",
      category: "Credit",
      title: `${fmt(totalCredit)} owed by ${plural(creditCustomers.length, "customer")}`,
      detail:
        (overLimit.length > 0
          ? `${list(overLimit.map((c) => `${c.firstName} ${c.lastName} (${fmt(c.creditBalance)} of ${fmt(c.creditLimit)})`))} ${overLimit.length === 1 ? "is" : "are"} over the limit you set.`
          : `Everyone on credit is within the limit you set.`) + (creditCustomers.length > 1 ? ` The largest balance is ${topShare}% of the total.` : ""),
      financial: `${fmt(totalCredit)} of medicine already given out and not yet paid for.`,
      recommendation: overLimit.length > 0 ? `Speak to ${list(overLimit.map((c) => c.firstName))} before extending more credit, and agree a payment date.` : `Keep recording credit sales so this stays accurate.`,
      evidence: "Credit balances and limits on customer records.",
      target: { screen: "customers", label: "Open customers" },
      priority: overLimit.length ? 2 : 3
    });
  }

  // ── Margin (only when the database supports it) ─────────
  if (finance && finance.revenue.total > 0) {
    const gross = finance.revenue.total - finance.cogs.total;
    const marginPct = Math.round((gross / finance.revenue.total) * 100);
    const untracked = finance.cogs.untracked_line_items;
    insights.push({
      id: "margin",
      type: marginPct < 20 ? "warning" : "info",
      category: "Margin",
      title: `Gross margin is ${marginPct}% over the last ${finance.window_days} days`,
      detail: `${fmt(finance.revenue.total)} of sales across ${plural(finance.revenue.transactions, "transaction")}, cost of goods ${fmt(finance.cogs.total)}.${untracked > 0 ? ` ${plural(untracked, "line")} had no linked product, so their cost isn’t included.` : ""}`,
      financial: `${fmt(gross)} gross profit. Operating expenses aren’t recorded in NevOut Meds, so this is not take-home profit.`,
      recommendation: marginPct < 20 ? `Margin is thin: compare supplier prices on your lowest-margin products and review selling prices.` : `Keep recording every sale against a product so cost of goods stays accurate.`,
      evidence: "Recorded sales and the unit cost of each product sold (server summary).",
      target: { screen: "financials", label: "Open financials" },
      priority: marginPct < 20 ? 2 : 4
    });

    const cashInStock = finance.inventory_value.at_cost;
    const cogsPerDay = finance.cogs.total / finance.window_days;
    if (cashInStock > 0 && cogsPerDay > 0) {
      const cover = Math.round(cashInStock / cogsPerDay);
      insights.push({
        id: "cover",
        type: "info",
        category: "Cash",
        title: `${fmt(cashInStock)} is held as stock — about ${plural(cover, "day")} of sales`,
        detail: `At the cost of goods sold over the last ${finance.window_days} days, current stock would last about ${plural(cover, "day")}.`,
        financial: `Valued at ${fmt(cashInStock)} at cost; it would sell for ${fmt(finance.inventory_value.at_retail)}.`,
        recommendation: `Keep fast movers deep and slow movers thin; the slow-stock and expiry findings show what to cut first.`,
        evidence: "Stock valued at cost against cost of goods sold (server summary).",
        target: { screen: "inventory", label: "Open inventory" },
        priority: 4
      });
    }
  }

  return insights.sort((a, b) => a.priority - b.priority);
}
