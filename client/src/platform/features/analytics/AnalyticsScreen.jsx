import { useMemo, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { INSIGHT_TYPES, generateInsights } from "@/platform/features/analytics/insights";
import { useFinancialSummary } from "@/platform/data/useFinancialSummary";
import { useSuppliers } from "@/platform/data/useSuppliers";
import { useSupplierCatalogue } from "@/platform/data/useSupplierCatalogue";
import { Badge, Button, Card, Chip, EmptyState, FilterBar, PageHeader, SkeletonBlock } from "@/platform/ui";
import { ArrowRight, CircleCheck, Sparkles } from "@/platform/ui/icons";

/**
 * The Analyst: rule-based findings from this pharmacy's own records, briefed
 * like an operations manager — what happened, why it matters, what to do, the
 * estimated effect and where the numbers come from. No model, no benchmarks:
 * it is labelled as analysis of recorded data, not as AI.
 */
export default function AnalyticsScreen({ medicines, customers, onNavigate }) {
  const financeQ = useFinancialSummary(30);
  const suppliersQ = useSuppliers();
  const catalogueQ = useSupplierCatalogue();
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(null);

  const insights = useMemo(
    () => generateInsights(medicines, customers, financeQ.data, { suppliers: suppliersQ.data ?? [], catalogue: catalogueQ.data ?? [] }),
    [medicines, customers, financeQ.data, suppliersQ.data, catalogueQ.data]
  );
  const categories = [...new Set(insights.map((i) => i.category))];
  const visible = insights.filter((i) => category === "all" || i.category === category);
  const [lead, ...rest] = visible;

  const f = financeQ.data;
  const margin = f && f.revenue.total > 0 ? ((f.revenue.total - f.cogs.total) / f.revenue.total) * 100 : null;
  const credit = customers.reduce((s, c) => s + (c.creditBalance || 0), 0);

  return (
    <div className="nv-page">
      <PageHeader title="Analyst" description="Findings from your own sales, stock, supplier and customer records — ranked by what needs action first." />

      {/* Evidence strip: the figures the findings are built on. */}
      <dl className="nv-evidence" aria-label="Last 30 days">
        <div><dt>Revenue (30d)</dt><dd className="nv-num">{financeQ.isLoading ? "…" : fmt(f?.revenue.total ?? 0, 0)}</dd></div>
        <div><dt>Gross margin</dt><dd className="nv-num">{financeQ.isLoading ? "…" : margin === null ? "—" : `${margin.toFixed(1)}%`}</dd></div>
        <div><dt>Stock at cost</dt><dd className="nv-num">{financeQ.isLoading ? "…" : fmt(f?.inventory_value.at_cost ?? 0, 0)}</dd></div>
        <div><dt>Customer credit</dt><dd className="nv-num">{fmt(credit, 0)}</dd></div>
      </dl>

      {categories.length > 1 && (
        <FilterBar>
          <Chip pressed={category === "all"} onClick={() => setCategory("all")}>All <span className="nv-num">{insights.length}</span></Chip>
          {categories.map((c) => (
            <Chip key={c} pressed={category === c} onClick={() => setCategory(c)}>{c} <span className="nv-num">{insights.filter((i) => i.category === c).length}</span></Chip>
          ))}
        </FilterBar>
      )}

      {financeQ.isLoading && insights.length === 0 ? (
        <Card><SkeletonBlock label="Analysing your records…" lines={4} /></Card>
      ) : !lead ? (
        <Card>
          <EmptyState tone="success" icon={<CircleCheck size={26} />} title="Nothing needs action">
            No stock, expiry, supplier, credit or margin issue stands out in your records right now.
          </EmptyState>
        </Card>
      ) : (
        <div className="nv-stack">
          <article className={`nv-insight nv-insight--lead nv-tone-${INSIGHT_TYPES[lead.type].tone}`} aria-labelledby={`ins-${lead.id}`}>
            <div className="nv-insight__kicker"><Sparkles size={16} aria-hidden="true" /> Priority finding · {lead.category}</div>
            <h3 id={`ins-${lead.id}`} className="nv-insight__title">{lead.title}</h3>
            <InsightBody i={lead} />
            {lead.target && onNavigate && (
              <Button variant="primary" onClick={() => onNavigate(lead.target.screen, lead.target.params ?? {})}>
                {lead.target.label} <ArrowRight size={16} aria-hidden="true" />
              </Button>
            )}
          </article>

          {rest.length > 0 && (
            <Card flush as="section" aria-label="Other findings">
              <ul className="nv-insight-list">
                {rest.map((i) => {
                  const t = INSIGHT_TYPES[i.type];
                  const expanded = open === i.id;
                  return (
                    <li key={i.id}>
                      <button type="button" className="nv-insight-list__toggle" aria-expanded={expanded} aria-controls={`ins-body-${i.id}`} onClick={() => setOpen(expanded ? null : i.id)}>
                        <Badge tone={t.tone}>{t.label}</Badge>
                        <span className="nv-insight-list__title">{i.title}</span>
                        <span className="nv-hint">{i.category}</span>
                      </button>
                      {expanded && (
                        <div id={`ins-body-${i.id}`} className="nv-insight-list__body">
                          <InsightBody i={i} />
                          {i.target && onNavigate && (
                            <Button size="sm" onClick={() => onNavigate(i.target.screen, i.target.params ?? {})}>{i.target.label}</Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}
      <p className="nv-hint" style={{ marginTop: 16 }}>
        Findings use only what you have recorded. Where data is missing (operating expenses, delivery costs, supplier reliability) NevOut Meds says so rather than estimating.
      </p>
    </div>
  );
}

function InsightBody({ i }) {
  return (
    <dl className="nv-insight__parts">
      <div><dt>Why it matters</dt><dd>{i.detail}</dd></div>
      <div><dt>Recommended action</dt><dd>{i.recommendation}</dd></div>
      <div><dt>Estimated effect</dt><dd>{i.financial}</dd></div>
      <div><dt>Evidence</dt><dd className="nv-hint">{i.evidence}</dd></div>
    </dl>
  );
}
