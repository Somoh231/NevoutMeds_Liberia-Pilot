import { useMemo, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { fmtDate } from "@/platform/utils/dates";
import { toProductView } from "@/platform/features/inventory/model";
import AdjustStockDialog from "@/platform/features/inventory/AdjustStockDialog";
import { Badge, Button, Card, EmptyState, PageHeader, SkeletonBlock } from "@/platform/ui";
import { CalendarClock, CircleCheck } from "@/platform/ui/icons";

// Urgency is carried by weight, not colour alone: level 1 bands sit on a critical
// surface with larger type; level 3 bands are dense and quiet.
const GROUPS = [
  { id: "expired", title: "Expired", tone: "danger", level: 1, hint: "Remove from sale now." },
  { id: "urgent", title: "Urgent · within 7 days", tone: "danger", level: 1, hint: "Dispense first, today." },
  { id: "d30", title: "Within 30 days", tone: "warning", level: 2, hint: "Dispense first; don’t reorder yet." },
  { id: "d60", title: "30–60 days", tone: "info", level: 3, hint: "Watch; order smaller quantities." },
  { id: "d90", title: "60–90 days", tone: "neutral", level: 3, hint: "On the radar." }
];

/** What NevOut Meds can honestly recommend, using only workflows it supports. */
function recommendation(p) {
  if (p.expiry === "expired") return { text: "Remove from sale and record the write-off.", action: "writeoff" };
  const willSell = p.unitsAtRiskAtExpiry === 0;
  if (p.dailyVelocity <= 0) return { text: "No sales rate recorded, so we can’t tell if it will sell in time. Dispense this batch first.", action: null };
  if (willSell) return { text: "Should sell before it expires at its recorded sales rate. Keep dispensing it first.", action: null };
  const hold = p.suggestedReorder > 0 ? " Hold the next order for it until this stock sells." : "";
  return { text: `About ${p.unitsAtRiskAtExpiry} ${p.unit} may not sell in time. Dispense this batch first.${hold}`, action: null };
}

/**
 * Expiry management: products grouped by urgency with the value at risk and a
 * recommended action. Transfers between pharmacies and returns to suppliers
 * are not supported workflows, so they are not offered.
 */
export default function ExpiryScreen({ medicines, setMedicines, onAdjustStock, onShowToast, dataStatus, onNavigate }) {
  const [writeOff, setWriteOff] = useState(null);
  const products = useMemo(() => medicines.map(toProductView).filter((p) => p.stock > 0), [medicines]);
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g.id, products.filter((p) => p.expiry === g.id).sort((a, b) => a.expiryDays - b.expiryDays)]));
  const noDate = products.filter((p) => p.expiry === "none");
  const sum = (ids, fn) => ids.flatMap((id) => byGroup[id]).reduce((s, p) => s + fn(p), 0);
  const expiredValue = sum(["expired"], (p) => p.valueAtCost);
  const near = ["urgent", "d30"];
  const nearRisk = sum(near, (p) => p.valueAtRiskAtExpiry);
  const laterValue = sum(["d60", "d90"], (p) => p.valueAtCost);
  const total = GROUPS.reduce((n, g) => n + byGroup[g.id].length, 0);

  if (dataStatus?.firstLoad && products.length === 0) {
    return <div className="nv-page"><Card><SkeletonBlock label="Loading stock…" lines={5} /></Card></div>;
  }

  return (
    <div className="nv-page">
      <PageHeader title="Expiry alerts" description={total ? `${total} product${total === 1 ? "" : "s"} expire within 90 days or have expired` : "Nothing expires within 90 days"} />

      <dl className="nv-pulse" style={{ margin: "0 0 var(--nv-space-5)" }}>
        <div className="nv-tone-danger">
          <dt>Already expired</dt>
          <dd className="nv-figure-lg" style={{ color: expiredValue > 0 ? "var(--nv-danger)" : undefined }}>{fmt(expiredValue)}</dd>
          <dd className="nv-pulse__sub">{byGroup.expired.length} product{byGroup.expired.length === 1 ? "" : "s"} · at cost</dd>
        </div>
        <div>
          <dt>Likely to expire unsold (≤30 days)</dt>
          <dd className="nv-figure-lg" style={{ color: nearRisk > 0 ? "var(--nv-warning)" : undefined }}>{fmt(nearRisk)}</dd>
          <dd className="nv-pulse__sub">at cost, from recorded sales rates</dd>
        </div>
        <div>
          <dt>Expiring in 30–90 days</dt>
          <dd className="nv-figure-lg">{fmt(laterValue)}</dd>
          <dd className="nv-pulse__sub">stock value at cost</dd>
        </div>
      </dl>

      {total === 0 ? (
        <Card>
          <EmptyState tone="success" icon={<CircleCheck size={26} />} title="No expiry risk in the next 90 days">
            {noDate.length ? `${noDate.length} product${noDate.length === 1 ? " has" : "s have"} no expiry date recorded, so they can’t be checked.` : "Every product with stock has an expiry date more than 90 days away."}
          </EmptyState>
        </Card>
      ) : (
        <div className="nv-stack">
          {GROUPS.filter((g) => byGroup[g.id].length > 0).map((g) => (
            <section key={g.id} aria-labelledby={`exp-${g.id}`}>
              <div className="nv-section-header">
                <div>
                  <h3 id={`exp-${g.id}`} className="nv-section-header__title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {g.title} <Badge tone={g.tone}>{byGroup[g.id].length}</Badge>
                  </h3>
                  <p className="nv-section-header__desc">{g.hint}</p>
                </div>
              </div>
              <div className={`nv-rows nv-urgency-${g.level}`} role="list" aria-label={g.title} style={{ "--cols": "minmax(180px, 1.6fr) 96px 110px 110px 110px minmax(200px, 2fr) 112px" }}>
                <div className="nv-rows__head" aria-hidden="true"><span>Medicine</span><span>Left</span><span>Quantity</span><span>Expires</span><span>Value at risk</span><span>Recommended</span><span /></div>
                {byGroup[g.id].map((p) => {
                  const rec = recommendation(p);
                  const risk = p.expiry === "expired" ? p.valueAtCost : p.valueAtRiskAtExpiry;
                  return (
                    <div key={p.id} role="listitem" className={`nv-row${g.level === 1 ? " nv-row--attention" : ""}`} style={{ "--row-accent": g.level === 1 ? "var(--nv-danger)" : undefined }}>
                      <div className="nv-row__main" style={{ cursor: "default" }}>
                        <span className="nv-row__title">{p.name}</span>
                        <span className="nv-row__sub">{p.batchId ? `Batch ${p.batchId}` : "No batch recorded"}</span>
                      </div>
                      <div className="nv-row__side"><Badge tone={g.tone}>{p.expiry === "expired" ? "Expired" : `${p.expiryDays} d`}</Badge></div>
                      <div className="nv-row__meta">
                        <strong className="nv-figure">{p.stock}</strong> <span className="nv-unit">{p.unit}</span> · {p.expiry === "expired" ? "expired" : "expires"} {fmtDate(p.expiryDate)}{risk > 0 ? ` · ${fmt(risk)} at risk` : ""}
                        <div style={{ marginTop: 4 }}>{rec.text}</div>
                      </div>
                      <div className="nv-row__cell"><span className="nv-figure">{p.stock}</span> <span className="nv-unit">{p.unit}</span></div>
                      <div className="nv-row__cell">{fmtDate(p.expiryDate)}</div>
                      <div className="nv-row__cell nv-num">{risk > 0 ? <span className="nv-figure">{fmt(risk)}</span> : <span className="nv-unit">None expected</span>}<small>{p.expiry === "expired" ? "all stock" : "unsold at expiry"}</small></div>
                      <div className="nv-row__cell nv-row__rec">{rec.text}</div>
                      <div className="nv-row__actions">
                        {rec.action === "writeoff" && (
                          <Button size="sm" variant="danger" onClick={() => setWriteOff(p)} aria-label={`Record write-off for ${p.name}`}>Write off</Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {noDate.length > 0 && total > 0 && (
        <p className="nv-hint" style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <CalendarClock size={16} aria-hidden="true" /> {noDate.length} product{noDate.length === 1 ? " has" : "s have"} no expiry date recorded and can’t be checked.
          {onNavigate && <button type="button" className="nv-link" style={{ background: "none", border: 0, padding: 0, minHeight: 24, cursor: "pointer" }} onClick={() => onNavigate("inventory")}>Open Inventory</button>}
        </p>
      )}
      <p className="nv-hint" style={{ marginTop: 8 }}>“At risk” uses each product’s recorded sales rate. Transfers to other pharmacies and returns to suppliers aren’t supported in NevOut Meds.</p>

      <AdjustStockDialog
        item={writeOff}
        preset={writeOff ? { delta: -writeOff.stock, note: "Damaged or expired" } : undefined}
        onClose={() => setWriteOff(null)}
        onAdjustStock={onAdjustStock}
        setMedicines={setMedicines}
        onShowToast={onShowToast}
      />
    </div>
  );
}
