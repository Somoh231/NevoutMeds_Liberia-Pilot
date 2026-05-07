import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import RequireRole from "@/platform/auth/RequireRole";
import { FONT, SLATE, GREEN } from "@/platform/constants";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { Toast } from "@/platform/components/primitives";
import { BarChartSimple } from "@/platform/components/primitives";

type Row = {
  pharmacy_id: string;
  pharmacy_name: string;
  users_count: number;
  last_seen_at: string | null;
  last_purchase_at: string | null;
  last_stock_movement_at: string | null;
  errors_24h: number;
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function AdminConsolePage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [successDash, setSuccessDash] = useState<any | null>(null);
  const [recentErrors, setRecentErrors] = useState<Array<{ id: string; created_at: string; message: string; pharmacy_id: string | null }> | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" | "warning" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"overview" | "success">("overview");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!supabase) {
        // Demo Mode: show placeholder numbers without cross-pharmacy data access.
        setRows([
          {
            pharmacy_id: "demo",
            pharmacy_name: "Demo Pharmacy",
            users_count: 3,
            last_seen_at: new Date().toISOString(),
            last_purchase_at: null,
            last_stock_movement_at: null,
            errors_24h: 0
          }
        ]);
        setSnapshot({
          dau: 1,
          purchases_24h: 0,
          inventory_adjustments_24h: 0,
          top_modules: [{ module: "dashboard", views: 1 }]
        });
        setSuccessDash({
          active_pharmacies: { total_onboarded: 1, active_7d: 1, active_30d: 1 },
          weekly_active_users: 1,
          purchases: { today: 0, last_7d: 0, trend: [] },
          inventory_updates: { stock_adjustments_7d: 0, imports_completed_7d: 0, trend: [] },
          most_used_features: [{ feature: "dashboard", views: 1 }],
          feedback: { issues_submitted_30d: 0, feature_requests_30d: 0, avg_satisfaction_rating_30d: null },
          retention_by_pharmacy: [
            {
              pharmacy_id: "demo",
              pharmacy_name: "Demo Pharmacy",
              last_active_at: new Date().toISOString(),
              active_days_30: 1,
              users_count: 3,
              total_purchases: 0,
              status: "healthy"
            }
          ]
        });
        setRecentErrors([]);
        return;
      }
      setBusy(true);
      try {
        const { data, error } = await supabase.rpc("admin_pilot_overview");
        if (error) throw error;
        if (!alive) return;
        setRows((data as any[]) as Row[]);

        const { data: snap, error: snapErr } = await supabase.rpc("admin_usage_snapshot", { p_days: 7 });
        if (!snapErr) setSnapshot(snap);

        const { data: sd, error: sdErr } = await supabase.rpc("admin_pilot_success_dashboard", { p_days: 7 });
        if (!sdErr) setSuccessDash(sd);

        const { data: errs } = await supabase.from("app_logs").select("id,created_at,message,pharmacy_id").order("created_at", { ascending: false }).limit(12);
        setRecentErrors((errs as any[]) ?? []);
      } catch (e: any) {
        setToast({ msg: e?.message || "Failed to load admin overview", type: "error" });
      } finally {
        if (alive) setBusy(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [supabase]);

  return (
    <RequireRole allow={["admin"]} redirectTo="/platform">
      <Toast toast={toast} />
      <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto", fontFamily: FONT }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, color: SLATE, letterSpacing: "-0.02em" }}>Admin Pilot Console</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Pilot pharmacies · activity · errors · transactions</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.12)", background: "#fff", fontWeight: 850, fontSize: 13, cursor: "pointer" }}
            >
              Refresh
            </button>
            <Link to="/platform" style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.12)", background: "#fff", fontWeight: 850, fontSize: 13, color: "#0f172a", textDecoration: "none" }}>
              ← Back to Platform
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            { id: "overview" as const, label: "Overview" },
            { id: "success" as const, label: "Pilot Success Dashboard" }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1.5px solid ${tab === t.id ? "#10b981" : "#e2e8f0"}`,
                background: tab === t.id ? "#f0fdf4" : "#fff",
                color: tab === t.id ? "#047857" : "#64748b",
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer"
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 950, color: SLATE }}>Pharmacies</div>
            {busy && <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8" }}>Loading…</div>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}>
                  {["Pharmacy", "Users", "Last seen", "Last purchase", "Last inventory change", "Errors (24h)", "Actions"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.pharmacy_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 900 }}>{r.pharmacy_name}</td>
                    <td style={{ padding: "10px 12px", color: "#334155", fontWeight: 800 }}>{r.users_count}</td>
                    <td style={{ padding: "10px 12px", color: "#334155" }}>{fmt(r.last_seen_at)}</td>
                    <td style={{ padding: "10px 12px", color: "#334155" }}>{fmt(r.last_purchase_at)}</td>
                    <td style={{ padding: "10px 12px", color: "#334155" }}>{fmt(r.last_stock_movement_at)}</td>
                    <td style={{ padding: "10px 12px", color: r.errors_24h ? "#b45309" : "#334155", fontWeight: 900 }}>{r.errors_24h}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <button
                        onClick={() => setToast({ msg: "Impersonation is disabled in the pilot console build (safe default).", type: "info" })}
                        style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 850, fontSize: 12, cursor: "pointer", color: "#334155" }}
                      >
                        Impersonate (disabled)
                      </button>
                    </td>
                  </tr>
                ))}
                {!busy && rows && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 18, color: "#64748b" }}>
                      No pharmacies found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginTop: 14 }}>
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 14 }}>
            <div style={{ fontWeight: 950, color: SLATE, marginBottom: 10 }}>Usage snapshot (last 7 days)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>DAU (24h)</div>
                <div style={{ fontSize: 20, fontWeight: 950, color: "#0f172a", marginTop: 4 }}>{snapshot?.dau ?? "—"}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Purchases (24h)</div>
                <div style={{ fontSize: 20, fontWeight: 950, color: "#0f172a", marginTop: 4 }}>{snapshot?.purchases_24h ?? "—"}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Inventory adj. (24h)</div>
                <div style={{ fontSize: 20, fontWeight: 950, color: "#0f172a", marginTop: 4 }}>{snapshot?.inventory_adjustments_24h ?? "—"}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Top modules</div>
                <div style={{ fontSize: 12, color: "#334155", marginTop: 6, lineHeight: 1.6 }}>
                  {(snapshot?.top_modules ?? []).slice(0, 4).map((m: any) => (
                    <div key={m.module} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 900 }}>{m.module}</span>
                      <span style={{ color: "#64748b", fontWeight: 900 }}>{m.views}</span>
                    </div>
                  ))}
                  {!snapshot?.top_modules?.length && <span style={{ color: "#94a3b8" }}>No data yet</span>}
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 14 }}>
            <div style={{ fontWeight: 950, color: SLATE, marginBottom: 10 }}>Recent errors</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(recentErrors ?? []).map((e) => (
                <div key={e.id} style={{ padding: 10, borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff7ed" }}>
                  <div style={{ fontSize: 11, color: "#9a3412", fontWeight: 950 }}>{new Date(e.created_at).toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: "#7c2d12", marginTop: 4, fontWeight: 800, lineHeight: 1.4 }}>{e.message}</div>
                </div>
              ))}
              {!busy && recentErrors && recentErrors.length === 0 && <div style={{ color: "#94a3b8", fontSize: 12 }}>No errors logged yet.</div>}
            </div>
          </div>
            </div>
          </>
        )}

        {tab === "success" && (
          <div style={{ display: "grid", gap: 14 }}>
            {!successDash && busy && (
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 16, color: "#64748b", fontWeight: 800 }}>Loading dashboard…</div>
            )}
            {!busy && successDash === null && (
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 16, color: "#64748b", fontWeight: 800 }}>
                No dashboard data yet (apply migrations + generate activity).
              </div>
            )}

            {successDash && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {[
                    { label: "Total pharmacies", value: successDash.active_pharmacies?.total_onboarded ?? "—" },
                    { label: "Active pharmacies (7d)", value: successDash.active_pharmacies?.active_7d ?? "—" },
                    { label: "Active pharmacies (30d)", value: successDash.active_pharmacies?.active_30d ?? "—" },
                    { label: "Weekly active users (7d)", value: successDash.weekly_active_users ?? "—" },
                    { label: "Purchases today", value: successDash.purchases?.today ?? "—" },
                    { label: "Purchases (7d)", value: successDash.purchases?.last_7d ?? "—" },
                    { label: "Stock adjustments (7d)", value: successDash.inventory_updates?.stock_adjustments_7d ?? "—" },
                    { label: "Imports completed (7d)", value: successDash.inventory_updates?.imports_completed_7d ?? "—" },
                    { label: "Issues (30d)", value: successDash.feedback?.issues_submitted_30d ?? "—" },
                    { label: "Feature requests (30d)", value: successDash.feedback?.feature_requests_30d ?? "—" },
                    { label: "Avg rating (30d)", value: successDash.feedback?.avg_satisfaction_rating_30d ?? "—" }
                  ].map((c) => (
                    <div key={c.label} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 14 }}>
                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>{c.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 950, color: "#0f172a", marginTop: 6 }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 14 }}>
                    <div style={{ fontWeight: 950, color: SLATE, marginBottom: 8 }}>Purchases trend (7 days)</div>
                    <BarChartSimple
                      data={(successDash.purchases?.trend ?? []).map((x: any) => Number(x.count ?? 0))}
                      color="#10b981"
                      height={56}
                    />
                  </div>
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 14 }}>
                    <div style={{ fontWeight: 950, color: SLATE, marginBottom: 8 }}>Inventory actions (7 days)</div>
                    <BarChartSimple
                      data={(successDash.inventory_updates?.trend ?? []).map((x: any) => Number(x.adjustments ?? 0) + Number(x.imports ?? 0))}
                      color="#3b82f6"
                      height={56}
                    />
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Adjustments + imports</div>
                  </div>
                </div>

                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 14 }}>
                  <div style={{ fontWeight: 950, color: SLATE, marginBottom: 10 }}>Most used features (by module views)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(successDash.most_used_features ?? []).map((f: any) => (
                      <div key={String(f.feature)} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 900, fontSize: 12, color: "#334155" }}>
                        {f.feature} · <span style={{ color: "#64748b" }}>{f.views}</span>
                      </div>
                    ))}
                    {!successDash.most_used_features?.length && <div style={{ color: "#94a3b8", fontSize: 12 }}>No events yet.</div>}
                  </div>
                </div>

                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                  <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0", fontWeight: 950, color: SLATE }}>Retention by pharmacy (30d)</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}>
                          {["Pharmacy", "Status", "Last active", "Active days (30)", "Users", "Total purchases"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(successDash.retention_by_pharmacy ?? []).map((r: any) => (
                          <tr key={r.pharmacy_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 950, color: "#0f172a" }}>{r.pharmacy_name}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 950, color: r.status === "healthy" ? "#047857" : r.status === "at risk" ? "#b45309" : "#94a3b8" }}>{r.status}</td>
                            <td style={{ padding: "10px 12px", color: "#334155" }}>{fmt(r.last_active_at ?? null)}</td>
                            <td style={{ padding: "10px 12px", color: "#334155", fontWeight: 900 }}>{r.active_days_30}</td>
                            <td style={{ padding: "10px 12px", color: "#334155", fontWeight: 900 }}>{r.users_count}</td>
                            <td style={{ padding: "10px 12px", color: "#334155", fontWeight: 900 }}>{r.total_purchases}</td>
                          </tr>
                        ))}
                        {!successDash.retention_by_pharmacy?.length && (
                          <tr>
                            <td colSpan={6} style={{ padding: 18, color: "#64748b" }}>
                              No data yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
          <b style={{ color: GREEN }}>Notes:</b> “Last seen” comes from the app stamping `users_profiles.last_seen_at`. Errors are client-side logs written to `app_logs`.
        </div>
      </div>
    </RequireRole>
  );
}

