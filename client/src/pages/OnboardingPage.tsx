import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { DARK, FONT, GREEN, SLATE } from "@/platform/constants";
import { useAuth } from "@/platform/auth/AuthProvider";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { MEDICINES } from "@/platform/seed/medicines";
import { CUSTOMERS_SEED } from "@/platform/seed/customers";
import BrandLogo from "@/components/BrandLogo";

export default function OnboardingPage() {
  const { user, loading, signOut } = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [pharmacyName, setPharmacyName] = useState(user?.pharmacy || "");
  const [country, setCountry] = useState("Liberia");
  const [city, setCity] = useState("Monrovia");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [seedProducts, setSeedProducts] = useState(true);
  const [seedCustomers, setSeedCustomers] = useState(true);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user?.pharmacyId) return <Navigate to="/platform" replace />;

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 560,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 22,
    backdropFilter: "blur(10px)"
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${DARK} 0%, #0c1a2e 50%, #064e3b 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: FONT,
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 20% 50%, #10b98115 0%, transparent 50%), radial-gradient(circle at 80% 20%, #3b82f615 0%, transparent 50%)",
          pointerEvents: "none"
        }}
      />

      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 5 }}>
        <Link
          to="/"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(2,6,23,0.35)",
            color: "rgba(255,255,255,0.92)",
            fontWeight: 850,
            textDecoration: "none",
            backdropFilter: "blur(10px)"
          }}
        >
          ← Back to site
        </Link>
      </div>

      <div style={{ width: "100%", maxWidth: 600, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 14px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)"
              }}
            >
              <BrandLogo height={44} />
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 950, color: "#fff", letterSpacing: "-0.03em" }}>Welcome — set up your pharmacy</div>
          <div style={{ fontSize: 13, color: "#6ee7b7", marginTop: 6, fontWeight: 500, lineHeight: 1.6 }}>
            This takes ~2 minutes. We’ll create your pharmacy workspace and owner profile.
          </div>
        </div>

        <div style={card}>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Pharmacy name</span>
              <input value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} placeholder="e.g. Monrovia Central Pharmacy" style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Country</span>
                <input value={country} onChange={(e) => setCountry(e.target.value)} style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>City</span>
                <input value={city} onChange={(e) => setCity(e.target.value)} style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
              </label>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Address (optional)</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Phone (optional)</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>WhatsApp (optional)</span>
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
              </label>
            </div>

            <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#e2e8f0", marginBottom: 8 }}>Optional starter data</div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(226,232,240,0.86)", fontSize: 13, fontWeight: 700 }}>
                <input type="checkbox" checked={seedProducts} onChange={(e) => setSeedProducts(e.target.checked)} />
                Add starter products ({MEDICINES.length})
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(226,232,240,0.86)", fontSize: 13, fontWeight: 700, marginTop: 8 }}>
                <input type="checkbox" checked={seedCustomers} onChange={(e) => setSeedCustomers(e.target.checked)} />
                Add starter customers ({CUSTOMERS_SEED.length})
              </label>
              <div style={{ fontSize: 12, color: "rgba(148,163,184,0.92)", marginTop: 8, lineHeight: 1.6 }}>
                You can import your real data from CSV/Excel later.
              </div>
            </div>

            {err && (
              <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.30)", padding: "10px 12px", borderRadius: 12, color: "#fecaca", fontSize: 12, lineHeight: 1.5 }}>
                {err}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                disabled={busy}
                onClick={async () => {
                  setErr(null);
                  if (!supabase) return setErr("Supabase not configured");
                  if (!pharmacyName.trim()) return setErr("Pharmacy name is required");
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

                    // Optional seed (best-effort; will be blocked by RLS if profile not visible yet)
                    if (seedProducts) {
                      await supabase.from("products").insert(
                        MEDICINES.map((m) => ({
                          pharmacy_id: pharmacyId,
                          name: m.name,
                          brand: m.brand,
                          category: m.category,
                          unit: m.unit,
                          unit_cost: m.unitCost,
                          selling_price: m.sellingPrice,
                          daily_velocity: m.dailyVelocity,
                          reorder_point: m.reorderPoint,
                          max_stock: m.maxStock,
                          is_essential: m.isEssential,
                          requires_prescription: m.requiresPrescription
                        }))
                      );
                    }

                    if (seedCustomers) {
                      await supabase.from("customers").insert(
                        CUSTOMERS_SEED.map((c) => ({
                          pharmacy_id: pharmacyId,
                          phone: c.phone,
                          first_name: c.firstName,
                          last_name: c.lastName,
                          community: c.community,
                          landmark: c.landmark,
                          county: c.county,
                          credit_balance: c.creditBalance,
                          credit_limit: c.creditLimit,
                          notes: c.notes ?? ""
                        }))
                      );
                    }

                    // Ensure AuthProvider refetches profile (pharmacyId) before ProtectedRoute checks.
                    window.location.assign("/platform");
                  } catch (e: any) {
                    setErr(e?.message || "Onboarding failed");
                  } finally {
                    setBusy(false);
                  }
                }}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg,#10b981,#059669)",
                  color: "#fff",
                  fontWeight: 950,
                  cursor: busy ? "not-allowed" : "pointer",
                  fontFamily: FONT,
                  boxShadow: "0 8px 24px #10b98130"
                }}
              >
                {busy ? "Setting up…" : "Create pharmacy workspace →"}
              </button>
              <button
                onClick={() => void signOut()}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e2e8f0",
                  fontWeight: 900,
                  cursor: "pointer",
                  fontFamily: FONT
                }}
              >
                Logout
              </button>
            </div>

            <div style={{ fontSize: 12, color: "rgba(148,163,184,0.92)", lineHeight: 1.6, marginTop: 8 }}>
              <span style={{ color: SLATE }}>Pilot readiness:</span> onboarding uses a secured server function to stay compatible with RLS.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

