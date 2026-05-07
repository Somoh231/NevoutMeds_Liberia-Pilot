import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import RequireRole from "@/platform/auth/RequireRole";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { Toast } from "@/platform/components/primitives";
import { trackEvent } from "@/platform/reliability/telemetry";

type ImportKind = "products" | "inventory" | "customers";

type PreviewRow = Record<string, any>;

async function parseFile(file: File): Promise<PreviewRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: "" }) as PreviewRow[];
  }

  const Papa = await import("papaparse");
  return new Promise((resolve, reject) => {
    Papa.default.parse<PreviewRow>(file as any, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve((res.data as any[]) || []),
      error: (error: Error) => reject(error)
    });
  });
}

export default function ImportPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [kind, setKind] = useState<ImportKind>("products");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dedupe, setDedupe] = useState<"skip" | "upsert">("upsert");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" | "warning" } | null>(null);

  const requiredCols = useMemo(() => {
    if (kind === "products") return ["name", "category", "unit_cost", "selling_price"];
    if (kind === "inventory") return ["product_name", "stock"];
    return ["phone", "first_name", "last_name"];
  }, [kind]);

  const preview = rows?.slice(0, 12) ?? [];

  return (
    <RequireRole allow={["owner", "admin"]}>
      <Toast toast={toast} />
      <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto", fontFamily: FONT }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: SLATE, letterSpacing: "-0.02em" }}>Import Tools</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>CSV/XLSX · Validation · Preview · Safe upserts</div>
          </div>
          <Link to="/platform" style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.12)", background: "#fff", fontWeight: 850, fontSize: 13, color: "#0f172a", textDecoration: "none" }}>
            ← Back to Platform
          </Link>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            ["products", "Products"],
            ["inventory", "Inventory"],
            ["customers", "Customers"]
          ].map(([id, label]) => (
            <button key={id} onClick={() => { setKind(id as ImportKind); setRows(null); setFile(null); setErr(null); }} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${kind === id ? "#10b981" : "#e2e8f0"}`, background: kind === id ? "#f0fdf4" : "#fff", color: kind === id ? "#047857" : "#64748b", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Upload CSV/XLSX</div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setErr(null);
                  setRows(null);
                  if (!f) return;
                  try {
                    const parsed = await parseFile(f);
                    setRows(parsed);
                    const cols = Object.keys(parsed[0] ?? {}).map((c) => c.toLowerCase());
                    const missing = requiredCols.filter((c) => !cols.includes(c));
                    if (missing.length) setErr(`Missing required columns: ${missing.join(", ")}`);
                  } catch (e: any) {
                    setErr((e?.message || "Failed to parse file") + ". Please export as CSV (UTF-8) or a simple XLSX with headers in row 1.");
                  }
                }}
              />
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8, lineHeight: 1.6 }}>
                Required columns for <b>{kind}</b>: <span style={{ fontWeight: 800 }}>{requiredCols.join(", ")}</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Duplicate handling</div>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { id: "upsert", label: "Upsert (recommended)" },
                  { id: "skip", label: "Skip duplicates" }
                ].map((o) => (
                  <button key={o.id} onClick={() => setDedupe(o.id as any)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${dedupe === o.id ? "#10b981" : "#e2e8f0"}`, background: dedupe === o.id ? "#f0fdf4" : "#fff", cursor: "pointer", fontWeight: 850, fontFamily: FONT, color: "#334155" }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {err && <div style={{ marginTop: 14, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", padding: "10px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{err}</div>}

          {rows && !err && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: SLATE }}>Preview ({rows.length} rows)</div>
                <button
                  disabled={busy || !user?.pharmacyId || !supabase}
                  onClick={async () => {
                    if (!user?.pharmacyId) return setErr("Missing pharmacy_id (complete onboarding first).");
                    if (!supabase) return setErr("Supabase not configured.");
                    if (!rows?.length) return;
                    setBusy(true);
                    setErr(null);
                    try {
                      let skipped = 0;
                      if (kind === "customers") {
                        const payload = rows
                          .map((r) => {
                            const phone = String(r.phone ?? "").trim();
                            const first_name = String(r.first_name ?? "").trim();
                            const last_name = String(r.last_name ?? "").trim();
                            if (!phone || !first_name || !last_name) return null;
                            return {
                              pharmacy_id: user.pharmacyId,
                              phone,
                              first_name,
                              last_name,
                              community: String(r.community ?? "").trim() || null,
                              county: String(r.county ?? "").trim() || null,
                              landmark: String(r.landmark ?? "").trim() || null,
                              credit_limit: Number(r.credit_limit ?? 0) || 0
                            };
                          })
                          .filter(Boolean) as any[];
                        skipped = rows.length - payload.length;
                        const { error } =
                          dedupe === "upsert"
                            ? await supabase.from("customers").upsert(payload, { onConflict: "pharmacy_id,phone" })
                            : await supabase.from("customers").insert(payload);
                        if (error) throw error;
                      }

                      if (kind === "products") {
                        const payload = rows
                          .map((r) => {
                            const name = String(r.name ?? "").trim();
                            const category = String(r.category ?? "").trim();
                            const unit_cost = Number(r.unit_cost ?? 0) || 0;
                            const selling_price = Number(r.selling_price ?? 0) || 0;
                            if (!name || !category) return null;
                            if (unit_cost < 0 || selling_price < 0) return null;
                            return {
                              pharmacy_id: user.pharmacyId,
                              name,
                              brand: String(r.brand ?? "").trim() || null,
                              category,
                              unit: String(r.unit ?? "").trim() || null,
                              unit_cost,
                              selling_price,
                              reorder_point: Number(r.reorder_point ?? 0) || 0,
                              max_stock: Number(r.max_stock ?? 0) || 0,
                              daily_velocity: Number(r.daily_velocity ?? 0) || 0
                            };
                          })
                          .filter(Boolean) as any[];
                        skipped = rows.length - payload.length;
                        const { error } =
                          dedupe === "upsert"
                            ? await supabase.from("products").upsert(payload, { onConflict: "pharmacy_id,name" })
                            : await supabase.from("products").insert(payload);
                        if (error) throw error;
                      }

                      if (kind === "inventory") {
                        // For pilot: match product by name within pharmacy, then upsert inventory by (pharmacy_id, product_id)
                        const { data: products, error: pErr } = await supabase.from("products").select("id,name").eq("pharmacy_id", user.pharmacyId);
                        if (pErr) throw pErr;
                        const byName = new Map((products ?? []).map((p: any) => [String(p.name).toLowerCase(), p.id]));
                        const payload = rows
                          .map((r) => {
                            const name = String(r.product_name ?? "").trim().toLowerCase();
                            const productId = byName.get(name);
                            if (!productId) return null;
                            return {
                              pharmacy_id: user.pharmacyId,
                              product_id: productId,
                              stock: Number(r.stock ?? 0) || 0,
                              batch_id: String(r.batch_id ?? "").trim() || null,
                              expiry_date: String(r.expiry_date ?? "").trim() || null
                            };
                          })
                          .filter(Boolean);
                        skipped = rows.length - payload.length;
                        const { error } = await supabase.from("inventory").upsert(payload as any[], { onConflict: "pharmacy_id,product_id" });
                        if (error) throw error;
                      }

                      setRows(null);
                      setFile(null);
                      setToast({ msg: `Import complete${skipped ? ` · ${skipped} row(s) skipped` : ""}`, type: skipped ? "warning" : "success" });
                      if (user?.pharmacyId) {
                        void trackEvent({
                          pharmacyId: user.pharmacyId,
                          userId: String(user.id),
                          eventName: "import_completed",
                          module: "import",
                          metadata: { kind, rows: rows.length, skipped }
                        });
                      }
                    } catch (e: any) {
                      setErr(e?.message || "Import failed");
                      setToast({ msg: e?.message || "Import failed", type: "error" });
                    } finally {
                      setBusy(false);
                    }
                  }}
                  style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: GREEN, color: "#fff", fontWeight: 950, cursor: busy ? "not-allowed" : "pointer", fontFamily: FONT }}
                >
                  {busy ? "Importing…" : "Import →"}
                </button>
              </div>

              <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}>
                      {Object.keys(preview[0] ?? {}).map((k) => (
                        <th key={k} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        {Object.keys(preview[0] ?? {}).map((k) => (
                          <td key={k} style={{ padding: "10px 12px", color: "#334155" }}>
                            {String((r as any)[k] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10, lineHeight: 1.6 }}>
                This is a pilot importer. Next hardening step: per-row validation errors + partial import reporting + retry failed rows.
              </div>
            </div>
          )}
        </div>
      </div>
    </RequireRole>
  );
}

