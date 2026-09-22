import { useState } from "react";
import { useSync } from "@/platform/offline/SyncProvider";
import { FONT } from "@/platform/constants";

/**
 * Honest sync state. The rule this enforces: work that only exists on this
 * device is never described as saved.
 */
const STYLES: Record<string, { bg: string; color: string; border: string; label: string; hint: string }> = {
  offline: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa", label: "Offline", hint: "Your work is saved on this device and will sync when you are back online." },
  syncing: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "Syncing…", hint: "Sending your saved work to the cloud." },
  pending: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "Waiting to sync", hint: "Saved on this device, not yet in the cloud." },
  conflict: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca", label: "Needs attention", hint: "Some work was rejected by the server and needs your decision. It is still saved here — nothing was thrown away." },
  failed: { bg: "#fffbeb", color: "#b45309", border: "#fde68a", label: "Sync failed", hint: "We could not send some work yet. It will retry automatically." },
  synced: { bg: "#f0fdf4", color: "#047857", border: "#bbf7d0", label: "Synced", hint: "Everything on this device is saved in the cloud." }
};

export default function SyncStatusBadge() {
  const { online, syncing, pending, failed, conflicts, queue, lastSyncAt, retryNow } = useSync();
  const [open, setOpen] = useState(false);

  const key = !online ? "offline" : conflicts > 0 ? "conflict" : syncing ? "syncing" : failed > 0 ? "failed" : pending > 0 ? "pending" : "synced";
  const s = STYLES[key];
  const count = pending + failed + conflicts;
  const waiting = queue.filter((q) => q.status !== "synced");

  return (
    <div style={{ position: "relative", fontFamily: FONT }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={s.hint}
        style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: 999, border: `1px solid ${s.border}`, background: s.bg, color: s.color, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: s.color, display: "inline-block" }} />
        {s.label}
        {count > 0 && <span style={{ fontWeight: 900 }}>· {count}</span>}
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 320, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, boxShadow: "0 12px 30px rgba(15,23,42,0.12)", padding: 14, zIndex: 60 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>{s.label}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.6 }}>{s.hint}</div>
          {lastSyncAt && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>Last sync {new Date(lastSyncAt).toLocaleTimeString()}</div>}

          {waiting.length > 0 && (
            <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 10, maxHeight: 220, overflowY: "auto" }}>
              {waiting.map((q) => (
                <div key={q.local_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", fontSize: 12 }}>
                  <span style={{ color: "#334155" }}>{q.summary}</span>
                  <span style={{ fontWeight: 800, color: q.status === "conflict" ? "#b91c1c" : q.status === "failed" ? "#b45309" : "#1d4ed8", whiteSpace: "nowrap" }}>
                    {q.status === "syncing" ? "sending" : q.status === "conflict" ? "needs attention" : q.status === "failed" ? `retry ${q.retry_count}` : "waiting"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {waiting.some((q) => q.status === "conflict") && (
            <div style={{ marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 10, fontSize: 11.5, color: "#b91c1c", lineHeight: 1.6 }}>
              {waiting.find((q) => q.status === "conflict")?.error_message}
            </div>
          )}

          {online && (pending > 0 || failed > 0) && (
            <button onClick={retryNow} style={{ marginTop: 12, width: "100%", padding: "9px", borderRadius: 10, border: "none", background: "#0f172a", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: FONT, fontSize: 12 }}>
              Try syncing now
            </button>
          )}
        </div>
      )}
    </div>
  );
}
