import { useMemo, useState } from "react";
import { fmt } from "@/platform/utils/format";
import { fmtDate } from "@/platform/utils/dates";
import { validateNewCustomer } from "@/platform/features/customers/rules";
import { formatPhone, getAddressFields, phoneHint, useCountry } from "@/platform/country";
import { buildNewCustomerRecord } from "@/platform/features/customers/purchases";
import SaleForm from "@/platform/features/sales/SaleForm";
import { useLayout } from "@/platform/shell/useBreakpoint";
import {
  Alert,
  Badge,
  Button,
  Chip,
  Dialog,
  Drawer,
  EmptyState,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  SearchInput,
  Select,
  SkeletonBlock,
  Textarea
} from "@/platform/ui";
import { Plus, Users } from "@/platform/ui/icons";
import { tenantToday } from "@/platform/country/tenant";

const COLS = "minmax(200px, 2fr) minmax(130px, 1fr) 110px 110px 130px 124px";
/** The pharmacy's business date (its own timezone). */
const TODAY = () => tenantToday();
const EMPTY = { firstName: "", lastName: "", phone: "", altPhone: "", altName: "", dob: "", gender: "", community: "", landmark: "", county: "", creditLimit: "", conditions: "", allergies: "", notes: "" };

const dueReminders = (c) => (c.reminders ?? []).filter((r) => !r.sent && r.dueDate && r.dueDate <= TODAY());
const isOverLimit = (c) => c.creditLimit > 0 && c.creditBalance > c.creditLimit;

export default function CustomersScreen({ customers, setCustomers, medicines, onShowToast, dataStatus, onRecordPurchase, onCreateCustomer, onNavigate, initialRegister, initialQuery }) {
  const layout = useLayout();
  const [search, setSearch] = useState(initialQuery ?? "");
  const [filter, setFilter] = useState("all");
  const [detailId, setDetailId] = useState(null);
  const [saleFor, setSaleFor] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(!!initialRegister);
  const [form, setForm] = useState(EMPTY);
  const { config: country, profile } = useCountry();
  const addressFields = getAddressFields(country.countryCode, { forCustomers: true });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const counts = useMemo(
    () => ({
      all: customers.length,
      credit: customers.filter((c) => c.creditBalance > 0).length,
      over: customers.filter(isOverLimit).length,
      refill: customers.filter((c) => dueReminders(c).length > 0).length,
      pending: customers.filter((c) => c._pendingSync).length
    }),
    [customers]
  );
  const totalCredit = customers.reduce((s, c) => s + (c.creditBalance || 0), 0);

  const q = search.trim().toLowerCase();
  const visible = customers
    .filter((c) => !q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || String(c.phone).replace(/\s/g, "").includes(q.replace(/\s/g, "")) || (c.community ?? "").toLowerCase().includes(q))
    .filter((c) => filter === "all" || (filter === "credit" ? c.creditBalance > 0 : filter === "over" ? isOverLimit(c) : filter === "refill" ? dueReminders(c).length > 0 : !!c._pendingSync))
    .sort((a, b) => Number(isOverLimit(b)) - Number(isOverLimit(a)) || String(b.lastVisit ?? "").localeCompare(String(a.lastVisit ?? "")) || a.firstName.localeCompare(b.firstName));
  const detail = customers.find((c) => c.id === detailId) ?? null;

  const register = async (e) => {
    e.preventDefault();
    if (saving) return;
    const v = validateNewCustomer({ phone: form.phone, firstName: form.firstName.trim(), lastName: form.lastName.trim() }, customers, country.countryCode);
    const next = {
      firstName: form.firstName.trim() ? undefined : "Enter the first name.",
      lastName: form.lastName.trim() ? undefined : "Enter the last name.",
      phone: !v.ok && v.error ? (v.error === "Phone already registered" ? "This phone number is already registered." : v.error === "Phone number required" ? "Enter a phone number." : v.error) : undefined,
      creditLimit: form.creditLimit !== "" && Number(form.creditLimit) < 0 ? "The credit limit cannot be negative." : undefined
    };
    setErrors(next);
    if (next.firstName || next.lastName || next.phone || next.creditLimit || !v.ok) return;
    const list = (s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
    const input = {
      phone: v.phone,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      altPhone: form.altPhone || undefined,
      altName: form.altName || undefined,
      dob: form.dob || undefined,
      gender: form.gender || undefined,
      community: form.community || undefined,
      landmark: form.landmark || undefined,
      county: form.county || undefined,
      creditLimit: Number(form.creditLimit) || 0,
      conditions: list(form.conditions),
      allergies: list(form.allergies),
      notes: form.notes || undefined
    };
    // Persisted first: the customer only appears once the database accepted it,
    // or is shown as pending when it was saved on this device only.
    if (typeof onCreateCustomer === "function") {
      setSaving(true);
      try {
        const saved = await onCreateCustomer(input);
        if (saved) setCustomers((prev) => [...prev, saved]);
        onShowToast(saved?._pendingSync ? `${input.firstName} saved on this device — will sync when you are back online` : `${input.firstName} registered`, saved?._pendingSync ? "info" : "success");
        setRegisterOpen(false);
        setForm(EMPTY);
      } catch (err) {
        onShowToast(err?.message || "Could not save customer — nothing was registered", "error");
      } finally {
        setSaving(false);
      }
      return;
    }
    setCustomers((prev) => [...prev, buildNewCustomerRecord(prev, { ...form, gender: form.gender || undefined }, v.phone)]);
    onShowToast(`${input.firstName} registered`, "success");
    setRegisterOpen(false);
    setForm(EMPTY);
  };
  const f = (k) => ({ value: form[k], onChange: (e) => setForm((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <div className="nv-page">
      <PageHeader
        title="Customers"
        description={`${customers.length} registered · ${fmt(totalCredit)} credit outstanding${counts.over ? ` · ${counts.over} over limit` : ""}`}
        actions={
          <Button variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => { setErrors({}); setRegisterOpen(true); }}>
            New customer
          </Button>
        }
      />
      {dataStatus?.error && <Alert tone="warning" className="nv-gap-below">Couldn’t refresh customers. Showing what this device last saw.</Alert>}

      <FilterBar search={<SearchInput label="Search customers" placeholder="Name, phone or community" value={search} onChange={(e) => setSearch(e.target.value)} />}>
        {[
          ["all", "All"],
          ["refill", "Refill due"],
          ["credit", "On credit"],
          ["over", "Over limit"],
          ["pending", "Pending sync"]
        ]
          .filter(([id]) => id === "all" || counts[id] > 0)
          .map(([id, label]) => (
            <Chip key={id} pressed={filter === id} onClick={() => setFilter(id)}>
              {label} <span className="nv-num">{counts[id]}</span>
            </Chip>
          ))}
      </FilterBar>

      {dataStatus?.firstLoad && customers.length === 0 ? (
        <div className="nv-card"><SkeletonBlock label="Loading customers…" lines={5} /></div>
      ) : customers.length === 0 ? (
        <div className="nv-card">
          <EmptyState icon={<Users size={26} />} title="No customers yet" actions={<Button variant="primary" onClick={() => setRegisterOpen(true)}>Register the first customer</Button>}>
            Register customers to record sales, keep credit accounts and send refill reminders.
          </EmptyState>
        </div>
      ) : visible.length === 0 ? (
        <div className="nv-card"><EmptyState title="No customers found">Try another name or phone number, or register a new customer.</EmptyState></div>
      ) : (
        <div className="nv-rows" role="list" aria-label="Customers" style={{ "--cols": COLS }}>
          <div className="nv-rows__head" aria-hidden="true">
            <span>Customer</span><span>Phone</span><span>Last visit</span><span>Spent</span><span>Credit</span><span style={{ textAlign: "right" }}>Actions</span>
          </div>
          {visible.map((c) => {
            const over = isOverLimit(c);
            const due = dueReminders(c).length;
            return (
              <div key={c.id} role="listitem" data-customer-card="" className={`nv-row${over ? " nv-row--attention" : ""}`} style={{ "--row-accent": "var(--nv-warning)" }}>
                <button type="button" className="nv-row__main" onClick={() => setDetailId(c.id)} aria-label={`${c.firstName} ${c.lastName}. Open details`}>
                  <span className="nv-row__title">{c.firstName} {c.lastName}</span>
                  <span className="nv-row__sub">{[c.community, c.landmark].filter(Boolean).join(" · ") || "No address recorded"}</span>
                </button>
                <div className="nv-row__side" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {c._pendingSync && <Badge tone="pending">Pending sync</Badge>}
                  {due > 0 && <Badge tone="info">Refill due</Badge>}
                  {c.creditBalance > 0 && <Badge tone={over ? "warning" : "neutral"}>{fmt(c.creditBalance)} credit</Badge>}
                </div>
                <div className="nv-row__meta">
                  {formatPhone(c.phone, country.countryCode)}
                  {c.lastVisit ? ` · last visit ${fmtDate(c.lastVisit)}` : " · no visits yet"}
                </div>
                <div className="nv-row__cell">{formatPhone(c.phone, country.countryCode)}</div>
                <div className="nv-row__cell">{c.lastVisit ? fmtDate(c.lastVisit) : "—"}</div>
                <div className="nv-row__cell">{fmt(c.totalSpend || 0, 0)}<small>{c.visitCount || 0} visit{c.visitCount === 1 ? "" : "s"}</small></div>
                <div className="nv-row__cell" style={{ color: over ? "var(--nv-warning)" : undefined }}>
                  {c.creditBalance > 0 ? fmt(c.creditBalance) : "—"}
                  {c.creditLimit > 0 && <small>limit {fmt(c.creditLimit, 0)}</small>}
                </div>
                <div className="nv-row__actions">
                  <Button size="sm" onClick={() => setSaleFor(c)} aria-label={`New sale for ${c.firstName} ${c.lastName}`} disabled={!!c._pendingSync} title={c._pendingSync ? "Available once this customer has synced" : undefined}>
                    Sale
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Drawer open={!!detail} onClose={() => setDetailId(null)} title={detail ? `${detail.firstName} ${detail.lastName}` : "Customer"} side={layout === "phone" ? "bottom" : "right"}>
        {detail && (
          <CustomerDetail
            c={detail}
            onSale={() => { setDetailId(null); setSaleFor(detail); }}
            onReminders={onNavigate ? () => { setDetailId(null); onNavigate("reminders", { customerId: detail.id }); } : undefined}
          />
        )}
      </Drawer>

      <Dialog open={!!saleFor} onClose={() => setSaleFor(null)} title={saleFor ? `Sale · ${saleFor.firstName} ${saleFor.lastName}` : "Sale"} width={640}>
        {saleFor && (
          <SaleForm
            customers={customers}
            medicines={medicines}
            initialCustomer={saleFor}
            setCustomers={setCustomers}
            onRecordPurchase={onRecordPurchase}
            onShowToast={onShowToast}
            onDone={() => setSaleFor(null)}
            closeOnRecord
          />
        )}
      </Dialog>

      <Dialog open={registerOpen} onClose={() => setRegisterOpen(false)} title="Register customer" description="Only the name and phone number are required. Record other details only if the customer shares them." width={620}>
        <form className="nv-stack" onSubmit={register} noValidate>
          <div className="nv-grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
            <FormField label="First name" required error={errors.firstName}><Input {...f("firstName")} autoComplete="given-name" /></FormField>
            <FormField label="Last name" required error={errors.lastName}><Input {...f("lastName")} autoComplete="family-name" /></FormField>
          </div>
          <FormField label="Phone" required error={errors.phone} hint={phoneHint(country.countryCode)}>
            <Input type="tel" inputMode="tel" placeholder={profile.phone.example} autoComplete="tel" {...f("phone")} />
          </FormField>
          <details className="nv-disclosure">
            <summary>More details (optional)</summary>
            <div className="nv-grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", marginTop: 12 }}>
              <FormField label="Other phone"><Input type="tel" inputMode="tel" {...f("altPhone")} /></FormField>
              <FormField label="Other contact’s name"><Input {...f("altName")} /></FormField>
              {/* Labels follow the country; values keep their stable columns. */}
              {addressFields.map((a) => (
                <FormField key={a.key} label={a.label} hint={a.hint}>
                  <Input {...f(a.column)} list={a.options ? `addr-${a.key}` : undefined} />
                  {a.options && <datalist id={`addr-${a.key}`}>{a.options.map((o) => <option key={o} value={o} />)}</datalist>}
                </FormField>
              ))}
              <FormField label="Date of birth"><Input type="date" {...f("dob")} /></FormField>
              <FormField label="Gender">
                <Select {...f("gender")}>
                  <option value="">Not recorded</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </Select>
              </FormField>
              <FormField label="Credit limit" error={errors.creditLimit} hint="0 means no credit.">
                <Input type="number" inputMode="decimal" min={0} step="0.01" {...f("creditLimit")} />
              </FormField>
            </div>
            <div className="nv-stack" style={{ marginTop: 12 }}>
              <FormField label="Conditions" hint="Comma-separated, as the customer reports them."><Input {...f("conditions")} /></FormField>
              <FormField label="Allergies" hint="Comma-separated. Shown when you record a sale."><Input {...f("allergies")} /></FormField>
              <FormField label="Notes"><Textarea {...f("notes")} style={{ minHeight: 72 }} /></FormField>
            </div>
          </details>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setRegisterOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>Register customer</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function CustomerDetail({ c, onSale, onReminders }) {
  const { config: country } = useCountry();
  const over = isOverLimit(c);
  const pct = c.creditLimit > 0 ? Math.min(100, (c.creditBalance / c.creditLimit) * 100) : 0;
  const reminders = [...(c.reminders ?? [])].sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  return (
    <div className="nv-stack">
      <dl className="nv-kv" style={{ margin: 0 }}>
        <div><dt>Phone</dt><dd style={{ fontSize: "1rem" }}>{formatPhone(c.phone, country.countryCode)}{c.altPhone && <small>also {formatPhone(c.altPhone, country.countryCode)}{c.altName ? ` (${c.altName})` : ""}</small>}</dd></div>
        <div><dt>Visits</dt><dd>{c.visitCount || 0}<small>{c.lastVisit ? `last ${fmtDate(c.lastVisit)}` : "none yet"}</small></dd></div>
        <div><dt>Total spent</dt><dd>{fmt(c.totalSpend || 0)}</dd></div>
      </dl>
      <section aria-labelledby="cd-credit" className="nv-card" style={{ boxShadow: "none", background: over ? "var(--nv-warning-bg)" : "var(--nv-surface-inset)", borderColor: over ? "var(--nv-warning-border)" : "var(--nv-divider)" }}>
        <h3 id="cd-credit" className="nv-section-header__title">Credit</h3>
        <p className="nv-num" style={{ marginTop: 4, fontSize: "1.125rem", fontWeight: 650 }}>
          {fmt(c.creditBalance || 0)} <span className="nv-hint">{c.creditLimit > 0 ? `of ${fmt(c.creditLimit)} limit` : "· no credit limit set"}</span>
        </p>
        {c.creditLimit > 0 && (
          <div className="nv-meter" style={{ maxWidth: "none", "--meter": over ? "var(--nv-warning)" : "var(--nv-brand)" }} aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        )}
        <p className="nv-hint" style={{ marginTop: 8 }}>Credit grows with sales paid “Credit”. Recording repayments isn’t available in NevOut Meds yet.</p>
      </section>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" onClick={onSale} disabled={!!c._pendingSync}>New sale</Button>
        {onReminders && <Button onClick={onReminders}>Refill reminders</Button>}
      </div>
      {(c.allergies?.length > 0 || c.conditions?.length > 0) && (
        <section aria-labelledby="cd-health">
          <h3 id="cd-health" className="nv-section-header__title" style={{ marginBottom: 6 }}>Recorded by the pharmacy</h3>
          {c.allergies?.length > 0 && <Alert tone="danger" title="Allergies">{c.allergies.join(", ")}</Alert>}
          {c.conditions?.length > 0 && <p style={{ marginTop: 8 }}>Conditions: {c.conditions.join(", ")}</p>}
        </section>
      )}
      <section aria-labelledby="cd-refills">
        <h3 id="cd-refills" className="nv-section-header__title" style={{ marginBottom: 6 }}>Refill reminders</h3>
        {reminders.length === 0 ? (
          <p className="nv-hint">No reminders set.</p>
        ) : (
          <ul className="nv-timeline">
            {reminders.map((r, i) => (
              <li key={r.id ?? i}>
                <span>{r.medicine}</span>
                <span className="nv-hint">{r.sent ? "Reminded" : r.dueDate <= TODAY() ? `Due ${fmtDate(r.dueDate)}` : fmtDate(r.dueDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="cd-history">
        <h3 id="cd-history" className="nv-section-header__title" style={{ marginBottom: 6 }}>Purchase history</h3>
        {(c.purchases ?? []).length === 0 ? (
          <p className="nv-hint">No purchases recorded.</p>
        ) : (
          <ul className="nv-timeline">
            {c.purchases.slice(0, 20).map((p, i) => (
              <li key={p.id ?? i}>
                <span style={{ minWidth: 0 }}><strong className="nv-num">{fmt(p.amount)}</strong> · {p.items}</span>
                <span className="nv-hint" style={{ whiteSpace: "nowrap" }}>{p.method} · {fmtDate(p.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {c.notes && <p className="nv-hint">Notes: {c.notes}</p>}
    </div>
  );
}
