import { useState } from "react";
import { fmt } from "@/platform/utils/format";
import { useDashboardKpis } from "@/platform/data/useDashboardKpis";
import SaleForm from "@/platform/features/sales/SaleForm";
import { Card, PageHeader, SectionHeader, SkeletonBlock } from "@/platform/ui";

/**
 * Counter view: record a sale in as few taps as possible, with today's sales
 * alongside. A sale always belongs to a registered customer (the server
 * requires it); registering a new one is one tap away.
 */
export default function SalesScreen({ customers, setCustomers, medicines, onRecordPurchase, onShowToast, onNavigate }) {
  const kpisQ = useDashboardKpis();
  const [formKey, setFormKey] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const todays = (kpisQ.data?.recentSales ?? []).filter((s) => s.date === today);

  return (
    <div className="nv-page">
      <PageHeader title="New sale" description="Choose the customer, add products, take payment." />
      <div className="nv-dash">
        <Card as="section" aria-label="Sale">
          <SaleForm
            key={formKey}
            customers={customers}
            medicines={medicines}
            setCustomers={setCustomers}
            onRecordPurchase={onRecordPurchase}
            onShowToast={onShowToast}
            onRegisterCustomer={() => onNavigate?.("customers", { register: true })}
            onDone={() => setFormKey((k) => k + 1)}
          />
        </Card>
        <aside className="nv-stack" aria-labelledby="sales-today-h">
          <SectionHeader title={<span id="sales-today-h">Latest sales today</span>} description={kpisQ.data ? `${kpisQ.data.salesCountToday} recorded · ${fmt(kpisQ.data.revenueToday)}` : undefined} />
          <Card>
            {kpisQ.isLoading && !kpisQ.data ? (
              <SkeletonBlock label="Loading today’s sales" lines={3} />
            ) : todays.length === 0 ? (
              <p className="nv-hint">No sales recorded yet today{kpisQ.isError ? " (sales history needs a connection)" : ""}.</p>
            ) : (
              <ul className="nv-timeline">
                {todays.map((s) => (
                  <li key={s.id}>
                    <span style={{ minWidth: 0 }}><strong className="nv-num">{fmt(s.amount)}</strong> · {s.items}</span>
                    <span className="nv-hint">{s.method}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="nv-hint" style={{ marginTop: 8 }}>Sales saved on this device while offline appear here once they sync.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
