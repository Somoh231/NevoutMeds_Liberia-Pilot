/**
 * The Sentry SDK, loaded lazily by monitoring.ts. Privacy-first configuration
 * (docs/observability/SENTRY_PRIVACY_POLICY.md):
 *  - dataCollection all off (SDK v11's replacement for sendDefaultPii: false):
 *    no user info, cookies, headers, bodies, query parameters, database data,
 *    frame variables or source context;
 *  - default integrations OFF. Only dedupe, linked errors, event filters and
 *    function-to-string are enabled. No breadcrumbs (console, clicks, fetch
 *    URLs), no Supabase instrumentation, no HTTP client capture, no tracing,
 *    no session tracking, and NO Replay (not installed);
 *  - every event and every string passes through scrubEvent() in beforeSend;
 *  - expected behaviour (wrong password/code, validation, conflicts, offline)
 *    is dropped before sending.
 */
import {
  captureException,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  init,
  linkedErrorsIntegration,
  setContext,
  setTags,
  withScope
} from "@sentry/react";
import { isExpectedError, pseudonym, scrubEvent, scrubString } from "./scrub";
import type { MonitoringContext } from "./monitoring";

const RELEASE = String(import.meta.env.VITE_APP_RELEASE ?? "").trim() || undefined;
const ENVIRONMENT = String(import.meta.env.VITE_SENTRY_ENVIRONMENT ?? "").trim() || (import.meta.env.PROD ? "production" : "development");

function deviceClass() {
  if (typeof window === "undefined") return "unknown";
  const w = window.innerWidth;
  return w < 768 ? "phone" : w < 1200 ? "tablet" : "desktop";
}

export async function start(dsn: string) {
  init({
    dsn,
    release: RELEASE,
    environment: ENVIRONMENT,
    // SDK v11 replaced `sendDefaultPii` with per-category controls; all off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0
    },
    defaultIntegrations: false,
    integrations: [
      dedupeIntegration(),
      linkedErrorsIntegration(),
      functionToStringIntegration(),
      eventFiltersIntegration({ ignoreErrors: [/ResizeObserver loop/i, /Failed to fetch/i, /Load failed/i, /NetworkError/i] })
    ],
    maxBreadcrumbs: 0,
    attachStacktrace: true,
    // No performance tracing in this phase: tracesSampleRate is deliberately unset.
    beforeBreadcrumb: () => null,
    beforeSend(event, hint) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
      if (isExpectedError(hint?.originalException)) return null;
      return scrubEvent(event as unknown as Parameters<typeof scrubEvent>[0]) as unknown as typeof event;
    }
  });
  setTags({ app: "nevout-meds", device: deviceClass() });

  return {
    capture(error: unknown, extra?: Record<string, unknown>) {
      if (isExpectedError(error)) return;
      withScope((scope) => {
        scope.setTag("online", typeof navigator === "undefined" ? "unknown" : String(navigator.onLine !== false));
        if (extra) scope.setExtras(Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, typeof v === "string" ? scrubString(v) : v])));
        captureException(error);
      });
    },
    setContext(ctx: MonitoringContext) {
      // Opaque context only: a one-way pseudonym for the pharmacy, never its name
      // or id; the role category; the screen; the offline queue length.
      void pseudonym(ctx.pharmacyId).then((tenant) => {
        setTags({
          route: ctx.route ?? undefined,
          role: ctx.role ?? undefined,
          tenant: tenant ?? undefined,
          area: ctx.area ?? undefined
        });
        setContext("sync", { queued: ctx.queue ?? null });
      });
    }
  };
}
