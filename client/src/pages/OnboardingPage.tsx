import { useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import AuthLayout from "@/platform/auth/AuthLayout";
import { friendlyAuthError } from "@/platform/auth/authMessages";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { MEDICINES } from "@/platform/seed/medicines";
import { Alert, Button, Checkbox, FormField, Input, Select } from "@/platform/ui";
import { COUNTRY_CODES, COUNTRY_PROFILES, CURRENCIES, getCountryConfig, getPaymentMethods, isCountryCode, parsePhone, type CountryCode } from "@/platform/country";
import { Store } from "@/platform/ui/icons";

export default function OnboardingPage() {
  const { user, session, loading, signOut } = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; country?: string; phone?: string; whatsapp?: string }>({});

  // The name the owner typed at sign-up (their own input, not a default).
  const [pharmacyName, setPharmacyName] = useState<string>(((session?.user?.user_metadata as any)?.pharmacy as string | undefined) ?? "");
  // Country first, and never pre-selected: it decides the currency, the
  // business-day timezone, phone rules and payment methods, so it must be
  // the owner's explicit choice.
  const [country, setCountry] = useState<CountryCode | "">("");
  const [currency, setCurrency] = useState("");
  const profile = country ? getCountryConfig(country) : null;
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  // Opt-in only. Starter customers were removed: invented patients (with
  // phone numbers and credit balances) must never enter a real pharmacy.
  const [seedProducts, setSeedProducts] = useState(false);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user?.pharmacyId) return <Navigate to="/platform" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const phoneCheck = phone.trim() && country ? parsePhone(phone, country) : null;
    const waCheck = whatsapp.trim() && country ? parsePhone(whatsapp, country) : null;
    const next = {
      name: pharmacyName.trim() ? undefined : "Enter your pharmacy’s name.",
      country: country ? undefined : "Choose the country your pharmacy is in.",
      phone: phoneCheck && !phoneCheck.ok ? phoneCheck.error : undefined,
      whatsapp: waCheck && !waCheck.ok ? waCheck.error : undefined
    };
    setFieldErrors(next);
    if (next.name || next.country || next.phone || next.whatsapp || !profile) return;
    const e164 = (c: typeof phoneCheck) => (c && c.ok ? c.e164 : null);
    setErr(null);
    if (!supabase) return setErr("Setup isn’t available on this installation yet.");
    setBusy(true);
    try {
      // The server validates the country, currency and timezone against its
      // own registry; the defaults for everything not chosen here come from it.
      let { data, error } = await supabase.rpc("onboard_pharmacy", {
        p_settings: {
          name: pharmacyName.trim(),
          country_code: country,
          default_currency: currency || profile.currencies[0],
          city: city.trim() || null,
          address: address.trim() || null,
          phone: e164(phoneCheck),
          whatsapp: e164(waCheck),
          owner_name: user?.name || "Owner"
        }
      });
      // A server without the Phase 9 model: the legacy RPC (country by name).
      if (error && (error.code === "PGRST202" || /onboard_pharmacy/.test(error.message ?? ""))) {
        ({ data, error } = await supabase.rpc("onboard_new_pharmacy", {
          p_pharmacy_name: pharmacyName.trim(),
          p_country: profile.name,
          p_city: city.trim(),
          p_address: address.trim() || null,
          p_phone: e164(phoneCheck),
          p_whatsapp: e164(waCheck),
          p_owner_name: user?.name || "Owner"
        }));
      }
      if (error) throw error;
      const pharmacyId = data as string;

      if (seedProducts) {
        await supabase.from("products").insert(
          MEDICINES.map((m) => ({
            pharmacy_id: pharmacyId,
            name: m.name,
            brand: m.brand,
            category: m.category,
            unit: m.unit,
            // Prices, sales velocity and stock levels are left at 0: sample
            // figures would feed real forecasts and financials.
            is_essential: m.isEssential,
            requires_prescription: m.requiresPrescription
          }))
        );
      }

      // Ensure AuthProvider refetches profile (pharmacyId) before ProtectedRoute checks.
      window.location.assign("/platform");
    } catch (ex) {
      setErr(friendlyAuthError(ex) === "Something went wrong. Please try again." ? "We couldn’t create your pharmacy. Check your connection and try again." : friendlyAuthError(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Set up your pharmacy"
      subtitle="This is how your pharmacy appears to your team and on messages to suppliers. You can change it later."
      back={null}
      footer={
        <button type="button" className="nv-link nv-link--quiet" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => void signOut()}>
          Sign out
        </button>
      }
    >
      <form className="nv-auth__form" onSubmit={submit} noValidate>
        {err && <Alert tone="danger">{err}</Alert>}
        <FormField label="Pharmacy name" required error={fieldErrors.name}>
          <Input value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} autoComplete="organization" />
        </FormField>
        <FormField label="Country" required error={fieldErrors.country} hint="Sets your currency, business day, phone format and payment methods.">
          <Select
            value={country}
            onChange={(e) => {
              const v = e.target.value;
              setCountry(isCountryCode(v) ? v : "");
              setCurrency(isCountryCode(v) ? COUNTRY_PROFILES[v].currencies[0] : "");
            }}
            data-field="country"
          >
            <option value="">Choose your country</option>
            {COUNTRY_CODES.map((c) => <option key={c} value={c}>{COUNTRY_PROFILES[c].name}</option>)}
          </Select>
        </FormField>
        {profile && (
          <div className="nv-card" style={{ background: "var(--nv-surface-inset)", boxShadow: "none" }} aria-live="polite">
            {profile.currencies.length > 1 ? (
              <FormField label="Currency you sell in" hint="Prices, sales and reports use this currency. It can’t be changed after your first sale.">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)} data-field="currency">
                  {profile.currencies.map((c) => <option key={c} value={c}>{CURRENCIES[c].name} ({CURRENCIES[c].symbol})</option>)}
                </Select>
              </FormField>
            ) : null}
            <dl className="nv-kv" style={{ margin: profile.currencies.length > 1 ? "12px 0 0" : 0 }}>
              {profile.currencies.length === 1 && <div><dt>Currency</dt><dd>{CURRENCIES[profile.currencies[0]].name} ({CURRENCIES[profile.currencies[0]].symbol})</dd></div>}
              <div><dt>Business day</dt><dd>{profile.timezones[0].replace("_", " ")} time</dd></div>
              <div><dt>Payment methods</dt><dd>{getPaymentMethods({ countryCode: profile.code }).join(", ")}<small>change them any time in Settings</small></dd></div>
            </dl>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          <FormField label="City or town">
            <Input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </FormField>
        </div>
        <FormField label="Address" hint="Optional — a landmark helps deliveries.">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
        </FormField>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          <FormField label="Phone" hint={profile ? `Optional · e.g. ${profile.phone.example}` : "Optional"} error={fieldErrors.phone}>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder={profile?.phone.example} />
          </FormField>
          <FormField label="WhatsApp" hint="Optional" error={fieldErrors.whatsapp}>
            <Input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" placeholder={profile?.phone.example} />
          </FormField>
        </div>
        <div className="nv-card" style={{ background: "var(--nv-surface-inset)", boxShadow: "none" }}>
          <Checkbox
            checked={seedProducts}
            onChange={(e) => setSeedProducts(e.target.checked)}
            label={`Add a starter list of ${MEDICINES.length} common medicines (names only — you set prices and stock)`}
          />
          <p className="nv-hint" style={{ marginTop: 4 }}>You can also import your own list from a spreadsheet after setup.</p>
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<Store size={18} aria-hidden="true" />}>
          Create pharmacy workspace
        </Button>
      </form>
    </AuthLayout>
  );
}
