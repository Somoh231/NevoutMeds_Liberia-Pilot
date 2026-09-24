import { useEffect, useId, useRef, useState } from "react";
import { useSync } from "@/platform/offline/SyncProvider";
import type { Tone } from "@/platform/design/tokens";
import { Alert } from "./feedback";
import { cx } from "./controls";
import { CircleCheck, CloudUpload, RefreshCw, TriangleAlert, WifiOff, type LucideIcon } from "./icons";

/**
 * Honest sync state. The rule this enforces: work that only exists on this
 * device is never described as saved. Labels are unchanged from Phase 6
 * ("Offline", "Waiting to sync", "Needs attention", "Synced") because staff
 * and the regression suites rely on them.
 */
type SyncKey = "offline" | "conflict" | "syncing" | "failed" | "pending" | "synced";
const STATES: Record<SyncKey, { tone: Tone; label: string; hint: string; Icon: LucideIcon }> = {
  offline: { tone: "offline", label: "Offline", hint: "Your work is saved on this device and will sync when you are back online.", Icon: WifiOff },
  syncing: { tone: "pending", label: "Syncing…", hint: "Sending your saved work to the cloud.", Icon: RefreshCw },
  pending: { tone: "pending", label: "Waiting to sync", hint: "Saved on this device, not yet in the cloud.", Icon: CloudUpload },
  conflict: { tone: "conflict", label: "Needs attention", hint: "Some work was rejected by the server and needs your decision. It is still saved here — nothing was thrown away.", Icon: TriangleAlert },
  failed: { tone: "warning", label: "Sync failed", hint: "We could not send some work yet. It will retry automatically.", Icon: TriangleAlert },
  synced: { tone: "success", label: "Synced", hint: "Everything on this device is saved in the cloud.", Icon: CircleCheck }
};

export function useSyncState() {
  const s = useSync();
  const key: SyncKey = !s.online ? "offline" : s.conflicts > 0 ? "conflict" : s.syncing ? "syncing" : s.failed > 0 ? "failed" : s.pending > 0 ? "pending" : "synced";
  return { ...s, key, state: STATES[key], waitingCount: s.pending + s.failed + s.conflicts };
}

/** The sync pill in the top bar, with a details panel listing every waiting item. */
export function SyncStatus({ compact }: { compact?: boolean }) {
  const { key, state, waitingCount, queue, lastSyncAt, online, pending, failed, retryNow, dismissConflict } = useSyncState();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  const waiting = queue.filter((q) => q.status !== "synced");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const { Icon } = state;
  return (
    <div ref={wrap} className="nv-menu-anchor">
      <button
        type="button"
        className={cx("nv-sync-pill", `nv-tone-${state.tone}`)}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        title={state.hint}
      >
        {key === "synced" ? <span className="nv-dot" aria-hidden="true" /> : <Icon size={16} aria-hidden="true" className={key === "syncing" ? "nv-syncing-icon" : undefined} />}
        {/* On phones the pill is icon + count (the banner under the top bar
            spells the state out); the label stays for screen readers. */}
        <span className={compact ? "nv-visually-hidden" : undefined}>{state.label}</span>
        {waitingCount > 0 && <span className="nv-num">· {waitingCount}</span>}
      </button>
      {open && (
        <div id={id} className="nv-menu nv-sync-panel" role="region" aria-label="Sync details">
          <div style={{ fontWeight: 650 }}>{state.label}</div>
          <p className="nv-hint" style={{ marginTop: 4, fontSize: "0.875rem", color: "var(--nv-text-secondary)" }}>{state.hint}</p>
          {lastSyncAt && <p className="nv-hint" style={{ marginTop: 6 }}>Last synced {new Date(lastSyncAt).toLocaleTimeString()}</p>}
          {waiting.length > 0 && (
            <div style={{ marginTop: 12, maxHeight: "min(60vh, 460px)", overflowY: "auto" }}>
              {waiting.map((q) => (
                <div key={q.local_id}>
                  <div className="nv-sync-row">
                    <span>{q.summary}</span>
                    <span style={{ fontWeight: 650, whiteSpace: "nowrap", color: q.status === "conflict" ? "var(--nv-conflict)" : q.status === "failed" ? "var(--nv-warning)" : "var(--nv-pending)" }}>
                      {q.status === "syncing" ? "sending" : q.status === "conflict" ? "needs attention" : q.status === "failed" ? `retry ${q.retry_count}` : "waiting"}
                    </span>
                  </div>
                  {q.status === "conflict" && (
                    <div className="nv-sync-conflict" data-conflict-id={q.local_id}>
                      <ConflictState message={q.error_message} />
                      {confirming === q.local_id ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                          <span className="nv-hint">Remove it from this device? It is not saved on the server.</span>
                          <button type="button" className="nv-btn nv-btn--danger" onClick={() => { setConfirming(null); void dismissConflict(q.local_id); }}>Remove</button>
                          <button type="button" className="nv-btn nv-btn--ghost" onClick={() => setConfirming(null)}>Keep</button>
                        </div>
                      ) : (
                        <button type="button" className="nv-btn nv-btn--ghost" style={{ marginTop: 8 }} onClick={() => setConfirming(q.local_id)}>
                          I&apos;ve dealt with this — remove it
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {online && (pending > 0 || failed > 0) && (
            <button type="button" className="nv-btn nv-btn--primary nv-btn--block" style={{ marginTop: 12 }} onClick={retryNow}>
              <RefreshCw size={16} aria-hidden="true" /> Try syncing now
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Connectivity banner under the top bar. Offline is a mode the user must be
 * able to see at a glance on every screen, not only inside a pill.
 */
export function OfflineStatus() {
  const { online, pending, failed, conflicts } = useSync();
  if (online && conflicts === 0) return null;
  if (!online) {
    const waiting = pending + failed;
    return (
      <div className="nv-banner nv-tone-offline nv-enter" role="status">
        <WifiOff size={18} aria-hidden="true" />
        <span>
          <strong>You’re offline.</strong> Keep working — {waiting > 0 ? `${waiting} change${waiting === 1 ? " is" : "s are"} saved on this device and will` : "changes are saved on this device and"} sync automatically.
        </span>
      </div>
    );
  }
  return (
    <div className="nv-banner nv-tone-conflict nv-enter" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <span>
        <strong>{conflicts} change{conflicts === 1 ? "" : "s"} need{conflicts === 1 ? "s" : ""} attention.</strong> The server could not accept {conflicts === 1 ? "it" : "them"}; nothing was lost. Open the sync status for details.
      </span>
    </div>
  );
}

/** Explains a rejected change and what to do about it. */
export function ConflictState({ message }: { message?: string | null }) {
  return (
    <Alert tone="conflict" title="A change was not accepted" className="nv-conflict">
      {message || "The server rejected this change."} It is still saved on this device. Check the item, then record it again if it is still needed.
    </Alert>
  );
}
