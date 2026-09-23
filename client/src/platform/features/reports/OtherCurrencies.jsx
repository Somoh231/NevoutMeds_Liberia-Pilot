import { moneyIn } from "@/platform/country/tenant";
import { Alert } from "@/platform/ui";

/**
 * Sales recorded in a currency other than the operating one. They are listed
 * next to the totals and never converted or added in: NevOut Meds has no
 * exchange-rate table.
 */
export default function OtherCurrencies({ summary }) {
  const others = summary?.other_currencies ?? [];
  if (others.length === 0) return null;
  return (
    <Alert tone="info" title={`Also recorded in ${others.map((o) => o.currency).join(", ")}`}>
      {others.map((o) => `${moneyIn(o.total, o.currency)} across ${o.transactions} sale${o.transactions === 1 ? "" : "s"}`).join(" · ")}.{" "}
      Not included in the {summary.currency ?? ""} totals above — amounts in different currencies are never added together.
    </Alert>
  );
}
