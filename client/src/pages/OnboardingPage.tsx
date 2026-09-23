import { useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import AuthLayout from "@/platform/auth/AuthLayout";
import { friendlyAuthError } from "@/platform/auth/authMessages";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { MEDICINES } from "@/platform/seed/medicines";
import { Alert, Button, Checkbox, FormField, Input } from "@/platform/ui";
import { Store } from "@/platform/ui/icons";

export default function OnboardingPage() {
  const { user, session, loading, signOut } = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; country?: string }>({});

  // The name the owner typed at sign-up (their own input, not a default).
  const [pharmacyName, setPharmacyName] = useState<string>(((session?.user?.user_metadata as any)?.pharmacy as string | undefined) ?? "");
  // No pre-filled location: a default here gets saved as real data.
  const [country, setCountry] = useState("");
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
    const next = {
      name: pharmacyName.trim() ? undefined : "Enter your pharmacy’s name.",
      country: country.trim() ? undefined : "Enter the country your pharmacy is in."
    };
    setFieldErrors(next);
    if (next.name || next.country) return;
    setErr(null);
    if (!supabase) return setErr("Setup isn’t available on this installation yet.");
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("onboard_new_pharmacy", {
        p_pharmacy_name: pharmacyName.trim(),
        p_country: country.trim(),
        p_city: city.trim(),
        p_address: address.trim() || null,
        p_phone: phone.trim() || null,
        p_whatsapp: whatsapp.trim() || null,
        p_owner_name: user?.name || "Owner"
      });
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          <FormField label="Country" required error={fieldErrors.country}>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" />
          </FormField>
          <FormField label="City or town">
            <Input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </FormField>
        </div>
        <FormField label="Address" hint="Optional — a landmark helps deliveries.">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
        </FormField>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          <FormField label="Phone" hint="Optional">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
          </FormField>
          <FormField label="WhatsApp" hint="Optional">
            <Input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" />
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
