/**
 * Application error monitoring (Phase 11): the only module the app imports.
 *
 * Tiny on purpose: it catches uncaught errors and unhandled promise rejections
 * from the very first moment, queues a few, and loads the Sentry SDK in its own
 * chunk only when a DSN is configured, the device is online and the browser is
 * idle. Monitoring is never a dependency: every call here is fire-and-forget,
 * swallows its own failures, and does nothing without VITE_SENTRY_DSN.
 *
 * Sentry = code-level exceptions. Domain health stays in ops_health / the
 * health check; recoverability stays in the backup heartbeat.
 */
export type MonitoringContext = {
  route?: string | null;
  role?: string | null;
  pharmacyId?: string | null;
  queue?: number | null;
  area?: string | null;
};

type Capture = (error: unknown, extra?: Record<string, unknown>) => void;
type Sdk = { capture: Capture; setContext: (c: MonitoringContext) => void };

const DSN = String(import.meta.env.VITE_SENTRY_DSN ?? "").trim();
export const monitoringEnabled = DSN.length > 0;

const queue: Array<[unknown, Record<string, unknown> | undefined]> = [];
let sdk: Sdk | null = null;
let loading = false;
let pendingContext: MonitoringContext = {};

function load() {
  if (!monitoringEnabled || sdk || loading) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  loading = true;
  import("./sentry")
    .then((m) => m.start(DSN))
    .then((s) => {
      sdk = s;
      s.setContext(pendingContext);
      for (const [e, x] of queue.splice(0)) s.capture(e, x);
    })
    .catch(() => {
      // The SDK chunk could not load (offline, blocked): try again later.
      loading = false;
    });
}

/** Report an unexpected failure. Expected behaviour is filtered in the SDK chunk. */
export function captureException(error: unknown, extra?: Record<string, unknown>) {
  if (!monitoringEnabled) return;
  try {
    if (sdk) sdk.capture(error, extra);
    else {
      if (queue.length < 10) queue.push([error, extra]);
      load();
    }
  } catch {
    /* never let monitoring throw into the app */
  }
}

/** Non-identifying context attached to later reports (the SDK pseudonymises the pharmacy id). */
export function setMonitoringContext(ctx: MonitoringContext) {
  pendingContext = { ...pendingContext, ...ctx };
  try {
    sdk?.setContext(pendingContext);
  } catch {
    /* ignore */
  }
}

/** Call once at startup: global handlers now, the SDK when the browser is idle. */
export function initMonitoring() {
  if (!monitoringEnabled || typeof window === "undefined") return;
  window.addEventListener("error", (e) => captureException(e.error ?? new Error(String(e.message || "Script error"))));
  window.addEventListener("unhandledrejection", (e) => captureException(e.reason ?? new Error("Unhandled promise rejection")));
  window.addEventListener("online", load);
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(load, { timeout: 8000 });
  else setTimeout(load, 4000);
}
