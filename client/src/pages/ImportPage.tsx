import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import RequireRole from "@/platform/auth/RequireRole";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { Toast } from "@/platform/components/primitives";
import { trackEvent } from "@/platform/reliability/telemetry";
import { MAX_IMPORT_ROWS, parseSpreadsheet } from "@/platform/import/parseSpreadsheet";
import { buildCustomers, buildInventory, buildProducts, describeProblems, type Problem } from "@/platform/import/rows";

type ImportKind = "products" | "inventory" | "customers";

type PreviewRow = Record<string, any>;

const OPTIONAL_COLS: Record<ImportKind, string> = {
  products: "brand, unit, reorder_point, max_stock, daily_velocity",
  inventory: "batch_id, expiry_date",
  customers: "community, county, landmark, credit_limit"
};

export default function ImportPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [kind, setKind] = useState<ImportKind>("products");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dedupe, setDedupe] = useState<"skip" | "upsert">("upsert");
  const [inputKey, setInputKey] = useState(0);
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
            <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>CSV/XLSX · Validation · Preview · Safe upserts</div>
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
            <button key={id} onClick={() => { setKind(id as ImportKind); setRows(null); setFile(null); setErr(null); }} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${kind === id ? "#0b6b50" : "#e2e8f0"}`, background: kind === id ? "#f0fdf4" : "#fff", color: kind === id ? "#047857" : "#64748b", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Upload CSV/XLSX</div>
              <input
                key={inputKey}
                type="file"
                className="nv-file-input"
                aria-label={`Choose a CSV or Excel file of ${kind}`}
                accept=".csv,.xlsx"
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setErr(null);
                  setRows(null);
                  if (!f) return;
                  try {
                    const parsed = await parseSpreadsheet(f);
                    setRows(parsed);
                    const cols = Object.keys(parsed[0] ?? {}).map((c) => c.toLowerCase());
                    const missing = requiredCols.filter((c) => !cols.includes(c));
                    if (missing.length) setErr(`Missing required columns: ${missing.join(", ")}`);
                  } catch (e: any) {
                    setErr((e?.message || "Failed to parse file") + ". Please export as CSV (UTF-8) or a simple XLSX with headers in row 1.");
                  }
                }}
              />
              <div style={{ fontSize: 12, color: "#5a6b64", marginTop: 8, lineHeight: 1.6 }}>
                Required columns for <b>{kind}</b>: <span style={{ fontWeight: 800 }}>{requiredCols.join(", ")}</span>. Optional: {OPTIONAL_COLS[kind]}. Header row first; column names are not case-sensitive. Numbers without currency symbols; dates as YYYY-MM-DD. Max 5 MB, first {MAX_IMPORT_ROWS} rows.
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{kind === "inventory" ? "Stock levels" : kind === "products" ? "Products that already exist (same name)" : "Customers that already exist (same phone)"}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {kind === "inventory" ? (
                  <div style={{ fontSize: 12, color: "#5a6b64", lineHeight: 1.6 }}>
                    Each row sets that product&apos;s stock to the number in the file. Every change is recorded as a stock movement. Products must already exist: import Products first.
                  </div>
                ) : [
                  { id: "upsert", label: "Update them with the values in the file (recommended)" },
                  { id: "skip", label: "Leave them unchanged; only add new ones" }
                ].map((o) => (
                  <button key={o.id} onClick={() => setDedupe(o.id as any)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${dedupe === o.id ? "#0b6b50" : "#e2e8f0"}`, background: dedupe === o.id ? "#f0fdf4" : "#fff", cursor: "pointer", fontWeight: 850, fontFamily: FONT, color: "#334155" }}>
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
                      let problems: Problem[] = [];
                      let saved = 0;
                      let unchanged = 0;
                      if (kind === "customers" || kind === "products") {
                        const built = kind === "customers"
                          ? buildCustomers(rows, user.pharmacyId, user.country?.countryCode ?? "LR")
                          : buildProducts(rows, user.pharmacyId);
                        problems = built.problems;
                        if (built.payload.length) {
                          const table = kind === "customers" ? "customers" : "products";
                          const onConflict = kind === "customers" ? "pharmacy_id,phone" : "pharmacy_id,name";
                          // "skip": existing records are left exactly as they are (ON CONFLICT DO NOTHING);
                          // only newly inserted rows come back, so the difference is what already existed.
                          const { data, error } = await supabase
                            .from(table)
                            .upsert(built.payload, { onConflict, ignoreDuplicates: dedupe === "skip" })
                            .select("id");
                          if (error) throw error;
                          saved = data?.length ?? 0;
                          unchanged = built.payload.length - saved;
                        }
                      }

                      if (kind === "inventory") {
                        // Server-side: matches products by name inside the
                        // caller's pharmacy, writes stock atomically and records
                        // an auditable movement per change (migration 0011).
                        const built = buildInventory(rows);
                        problems = built.problems;
                        if (built.payload.length) {
                          const { data, error } = await supabase.rpc("import_inventory_levels", {
                            p_pharmacy_id: user.pharmacyId,
                            p_rows: built.payload
                          });
                          if (error) throw error;
                          const result = (data ?? {}) as { applied?: number; errors?: Array<{ row: number; reason: string }> };
                          saved = result.applied ?? 0;
                          // The server numbers the rows it was sent; map back to spreadsheet rows.
                          for (const e of result.errors ?? []) problems.push({ row: built.lines[e.row - 1] ?? e.row, reason: e.reason });
                        }
                      }

                      setErr(problems.length ? `${problems.length} row(s) were not imported. Fix them in the file and import it again: ${describeProblems(problems)}` : null);
                      setRows(null);
                      setFile(null);
                      setInputKey((k) => k + 1);
                      const parts = [`${saved} row(s) ${kind === "inventory" ? "updated" : dedupe === "skip" ? "added" : "added or updated"}`];
                      if (unchanged) parts.push(`${unchanged} already existed and were left unchanged`);
                      if (problems.length) parts.push(`${problems.length} not imported`);
                      setToast({ msg: `Import finished: ${parts.join(" · ")}`, type: problems.length ? "warning" : "success" });
                      if (user?.pharmacyId) {
                        void trackEvent({
                          pharmacyId: user.pharmacyId,
                          userId: String(user.id),
                          eventName: "import_completed",
                          module: "import",
                          metadata: { kind, rows: rows.length, saved, unchanged, skipped: problems.length }
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

              <div style={{ fontSize: 12, color: "#5a6b64", marginTop: 10, lineHeight: 1.6 }}>
                Nothing is saved until you press Import. Rows with problems are not imported; they are listed with their row number so you can fix the file and import it again.
              </div>
            </div>
          )}
        </div>
      </div>
    </RequireRole>
  );
}

