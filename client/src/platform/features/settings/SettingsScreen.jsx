import { useState } from "react";
import {
  COUNTRY_CODES, COUNTRY_PROFILES, CURRENCIES, getAddressFields, getAvailablePaymentMethods, getCountryConfig,
  getPaymentMethods, getRegulatoryFields, getTaxPolicy, isCountryCode, parsePhone, paymentMethodHint, tenantDateTime
} from "@/platform/country";
import { friendlySettingsError, useConfigChanges, usePharmacySettings, useUpdatePharmacySettings } from "@/platform/data/pharmacySettings";
import { useSync } from "@/platform/offline/SyncProvider";
import { Alert, Badge, Button, Card, Checkbox, Dialog, FormField, Input, PageHeader, Select, SkeletonBlock, Tabs, tabPanelProps } from "@/platform/ui";

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "money", label: "Money" },
  { id: "contact", label: "Contact" },
  { id: "regulatory", label: "Registration" }
];

const FIELD_LABEL = {
  country_code: "Country", default_currency: "Currency", timezone: "Business-day timezone", locale: "Language & format",
  payment_methods: "Payment methods", address_fields: "Address", regulatory: "Registration details"
};

/**
 * Owner settings. Every save goes through update_pharmacy_settings, which
 * validates against the server's country registry and refuses country or
 * currency changes once sales exist — the UI explains that lock rather than
 * relying on it.
 */
export default function SettingsScreen({ onShowToast }) {
  const q = usePharmacySettings();
  const { online } = useSync();
  const [section, setSection] = useState("general");
  const row = q.data?.row;

  return (
    <div className="nv-page">
      <PageHeader title="Settings" description="Your pharmacy’s details, country, currency and payment methods." />
      {!online && <Alert tone="offline" className="nv-gap-below">Settings need a connection. You can look, but changes can’t be saved offline.</Alert>}
      <div style={{ marginBottom: 16 }}>
        <Tabs idBase="set" label="Settings section" value={section} onChange={setSection} tabs={SECTIONS} block />
      </div>
      <div {...tabPanelProps("set", section)} style={{ outline: "none" }} className="nv-stack">
        {q.isLoading && !row ? (
          <Card><SkeletonBlock label="Loading settings" lines={5} /></Card>
        ) : !row ? (
          <Alert tone="warning" title="Settings couldn’t be loaded">Check your connection and try again.</Alert>
        ) : !row.country_code ? (
          <Alert tone="warning" title="Country settings aren’t available on this server yet">
            The database needs the Phase 9 update before country, currency and payment settings can be changed. Your pharmacy keeps working as before (US$, Liberia).
          </Alert>
        ) : (
          <>
            {section === "general" && <GeneralSection key={`g-${row.country_code}-${row.name}`} row={row} locked={q.data.locked} online={online} onShowToast={onShowToast} />}
            {section === "money" && <MoneySection key={`m-${row.country_code}-${row.default_currency}`} row={row} locked={q.data.locked} online={online} onShowToast={onShowToast} />}
            {section === "contact" && <ContactSection key={`c-${row.country_code}`} row={row} online={online} onShowToast={onShowToast} />}
            {section === "regulatory" && <RegulatorySection key={`r-${row.country_code}`} row={row} online={online} onShowToast={onShowToast} />}
            <ChangeLog />
          </>
        )}
      </div>
    </div>
  );
}

function useSave(onShowToast) {
  const m = useUpdatePharmacySettings();
  const [error, setError] = useState(null);
  const save = async (changes, message = "Settings saved") => {
    setError(null);
    try {
      await m.mutateAsync(changes);
      onShowToast?.(message, "success");
      return true;
    } catch (e) {
      setError(friendlySettingsError(e));
      return false;
    }
  };
  return { save, error, busy: m.isPending };
}

function LockNote({ locked }) {
  if (locked === null || locked === undefined) return null;
  return locked ? (
    <Alert tone="info" title="Country and currency are locked">
      Sales are recorded, and every recorded amount keeps the currency it was entered in. To correct a mis-configured pharmacy, contact NevOut Meds support.
    </Alert>
  ) : (
    <p className="nv-hint">Country and currency can be changed until your first sale is recorded.</p>
  );
}

function GeneralSection({ row, locked, online, onShowToast }) {
  const { save, error, busy } = useSave(onShowToast);
  const [name, setName] = useState(row.name ?? "");
  const [country, setCountry] = useState(row.country_code);
  const [locale, setLocale] = useState(row.locale);
  const [confirm, setConfirm] = useState(false);
  const profile = getCountryConfig(row.country_code);
  const target = getCountryConfig(country);
  const countryChanged = country !== row.country_code;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (countryChanged) return setConfirm(true);
    await save({ name: name.trim(), locale });
  };
  const confirmCountry = async () => {
    // Currency, timezone, locale and payment methods follow the new country.
    const ok = await save({ name: name.trim(), country_code: country }, `Country changed to ${target.name}`);
    if (ok) setConfirm(false);
  };

  return (
    <Card>
      <form className="nv-stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="Pharmacy name" required error={!name.trim() ? "Enter your pharmacy’s name." : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
        </FormField>
        <FormField label="Country" hint={locked ? "Locked after the first sale." : "Sets currency, business day, phone format and payment methods."}>
          <Select value={country} disabled={!!locked} onChange={(e) => isCountryCode(e.target.value) && setCountry(e.target.value)} data-field="country">
            {COUNTRY_CODES.map((c) => <option key={c} value={c}>{COUNTRY_PROFILES[c].name}</option>)}
          </Select>
        </FormField>
        <dl className="nv-kv" style={{ margin: 0 }}>
          <div><dt>Business day</dt><dd>{(countryChanged ? target : profile).timezones[0].replace("_", " ")} time<small>“today” in sales, reports and reminders follows this clock, not the device’s</small></dd></div>
        </dl>
        {!countryChanged && profile.locales.length > 1 && (
          <FormField label="Number & date format">
            <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
              {profile.locales.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </FormField>
        )}
        <LockNote locked={locked} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" loading={busy} disabled={!online}>Save</Button>
        </div>
      </form>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Change country to ${target.name}?`} width={520}>
        <div className="nv-stack">
          <p>Your pharmacy has no recorded sales yet, so this is still allowed. After the change:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Prices, sales and reports use <strong>{CURRENCIES[target.currencies[0]].name} ({CURRENCIES[target.currencies[0]].symbol})</strong>.</li>
            <li>The business day follows <strong>{target.timezones[0].replace("_", " ")}</strong> time.</li>
            <li>Payment methods reset to: {getPaymentMethods({ countryCode: target.code }).join(", ")}.</li>
            <li>Product prices you already entered are <strong>not converted</strong> — check them before your first sale.</li>
          </ul>
          {error && <Alert tone="danger">{error}</Alert>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={confirmCountry}>Change country</Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

function MoneySection({ row, locked, online, onShowToast }) {
  const { save, error, busy } = useSave(onShowToast);
  const profile = getCountryConfig(row.country_code);
  const [currency, setCurrency] = useState(row.default_currency);
  const [methods, setMethods] = useState(() => getPaymentMethods({ countryCode: row.country_code, paymentMethods: row.payment_methods }));
  const available = getAvailablePaymentMethods(row.country_code);
  const tax = getTaxPolicy(row.country_code);
  const toggle = (m) => setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : available.filter((x) => prev.includes(x) || x === m)));

  const submit = async (e) => {
    e.preventDefault();
    if (methods.length === 0) return;
    const changes = { payment_methods: methods };
    if (currency !== row.default_currency) changes.default_currency = currency;
    await save(changes);
  };

  return (
    <Card>
      <form className="nv-stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="Currency you sell in" hint={profile.currencies.length > 1 ? (locked ? "Locked after the first sale." : "Used for prices, sales and reports.") : undefined}>
          <Select value={currency} disabled={!!locked || profile.currencies.length < 2} onChange={(e) => setCurrency(e.target.value)} data-field="currency">
            {profile.currencies.map((c) => <option key={c} value={c}>{CURRENCIES[c].name} ({CURRENCIES[c].symbol})</option>)}
          </Select>
        </FormField>
        <p className="nv-hint" style={{ marginTop: -4 }}>Supplier prices can also be recorded in US dollars. Amounts in different currencies are shown side by side, never converted.</p>
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="nv-label" style={{ marginBottom: 6 }}>Payment methods at the till</legend>
          <div className="nv-stack" style={{ gap: 4 }}>
            {available.map((m) => (
              <Checkbox key={m} checked={methods.includes(m)} onChange={() => toggle(m)} label={<>{m}{paymentMethodHint(m) && <small className="nv-hint"> · {paymentMethodHint(m)}</small>}</>} />
            ))}
          </div>
          {methods.length === 0 && <p className="nv-field__error" role="alert">Keep at least one payment method.</p>}
        </fieldset>
        <Alert tone="info" title="Tax / VAT">{tax.note}</Alert>
        <LockNote locked={locked} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" loading={busy} disabled={!online || methods.length === 0}>Save</Button>
        </div>
      </form>
    </Card>
  );
}

function ContactSection({ row, online, onShowToast }) {
  const { save, error, busy } = useSave(onShowToast);
  const fields = getAddressFields(row.country_code);
  const profile = getCountryConfig(row.country_code);
  const [form, setForm] = useState({ phone: row.phone ?? "", whatsapp: row.whatsapp ?? "", city: row.city ?? "", address: row.address ?? "" });
  const [addr, setAddr] = useState(() => ({ ...(row.address_fields ?? {}) }));
  const [errs, setErrs] = useState({});
  const f = (k) => ({ value: form[k], onChange: (e) => setForm((p) => ({ ...p, [k]: e.target.value })) });

  const submit = async (e) => {
    e.preventDefault();
    const check = (v) => (v.trim() ? parsePhone(v, row.country_code) : null);
    const p = check(form.phone);
    const w = check(form.whatsapp);
    const next = { phone: p && !p.ok ? p.error : undefined, whatsapp: w && !w.ok ? w.error : undefined };
    setErrs(next);
    if (next.phone || next.whatsapp) return;
    const clean = Object.fromEntries(Object.entries(addr).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v));
    await save({ phone: p?.ok ? p.e164 : null, whatsapp: w?.ok ? w.e164 : null, city: form.city, address: form.address, address_fields: clean });
  };

  return (
    <Card>
      <form className="nv-stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="nv-grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
          <FormField label="Phone" error={errs.phone} hint={`e.g. ${profile.phone.example}`}><Input type="tel" inputMode="tel" autoComplete="tel" {...f("phone")} /></FormField>
          <FormField label="WhatsApp" error={errs.whatsapp} hint="Shown on messages to suppliers"><Input type="tel" inputMode="tel" {...f("whatsapp")} /></FormField>
          <FormField label="City or town"><Input autoComplete="address-level2" {...f("city")} /></FormField>
          <FormField label="Street address"><Input autoComplete="street-address" {...f("address")} /></FormField>
          {fields.map((a) => (
            <FormField key={a.key} label={a.label} hint={a.hint}>
              <Input value={addr[a.key] ?? ""} onChange={(e) => setAddr((p) => ({ ...p, [a.key]: e.target.value }))} list={a.options ? `set-addr-${a.key}` : undefined} />
              {a.options && <datalist id={`set-addr-${a.key}`}>{a.options.map((o) => <option key={o} value={o} />)}</datalist>}
            </FormField>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" loading={busy} disabled={!online}>Save</Button>
        </div>
      </form>
    </Card>
  );
}

function RegulatorySection({ row, online, onShowToast }) {
  const { save, error, busy } = useSave(onShowToast);
  const fields = getRegulatoryFields(row.country_code);
  const [values, setValues] = useState(() => ({ ...(row.regulatory ?? {}) }));
  const submit = async (e) => {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v));
    await save({ regulatory: clean });
  };
  return (
    <Card>
      <form className="nv-stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <p className="nv-hint">Optional, for your own records. NevOut Meds doesn’t check these numbers, print them on anything or send them to any authority.</p>
        {fields.map((r) => (
          <FormField
            key={r.key}
            label={<>{r.label} <Badge tone={r.certainty === "KNOWN" ? "neutral" : "warning"}>{r.certainty === "KNOWN" ? "Optional" : "Rules not yet verified"}</Badge></>}
            hint={r.note}
          >
            <Input value={values[r.key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [r.key]: e.target.value }))} />
          </FormField>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" loading={busy} disabled={!online}>Save</Button>
        </div>
      </form>
    </Card>
  );
}

function ChangeLog() {
  const q = useConfigChanges();
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  const show = (v) => (v === null || v === undefined ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? `${Object.keys(v).length} field${Object.keys(v).length === 1 ? "" : "s"}` : String(v));
  return (
    <Card as="section" aria-labelledby="set-log">
      <h3 id="set-log" className="nv-section-header__title" style={{ marginBottom: 8 }}>Recent changes</h3>
      <ul className="nv-timeline">
        {rows.map((c) => (
          <li key={c.id}>
            <span style={{ minWidth: 0 }}><strong>{FIELD_LABEL[c.field] ?? c.field}</strong> · {show(c.old_value)} → {show(c.new_value)}</span>
            <span className="nv-hint" style={{ whiteSpace: "nowrap" }}>{tenantDateTime(c.changed_at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
