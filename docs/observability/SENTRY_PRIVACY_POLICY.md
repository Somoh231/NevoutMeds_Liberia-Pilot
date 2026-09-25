# Sentry: privacy policy and configuration

Phase 11. Sentry is used for **code-level error diagnosis** only. It does not replace the
existing monitoring:

| Concern | Tool |
|---|---|
| Code and application exceptions (a bug in a screen, an unhandled rejection, a sync-engine fault) | **Sentry** |
| Domain and system health (site, API, Edge Function, sync conflicts and failures, storage, integrity, silent pharmacies) | `ops_health()` + `ops/monitor/health-check.mjs` |
| Recoverability | Backup heartbeat (`ops_record_backup_run`) + restore drills |

NevOut Meds holds pharmacy and customer information: names, phone numbers, purchase history
and credit. **The default is to send nothing personal.** When in doubt, a field is removed.

## 1. SDK and integrations

**SDK:** `@sentry/react` **11.0.0**, the current major, which supports React 18. It is **loaded
lazily** (`client/src/platform/observability/sentry.ts`, 33.4 kB gzip) only when all of these
hold:
- `VITE_SENTRY_DSN` is set;
- the device is online;
- the browser is idle.

The SDK chunk is **excluded from the service-worker precache**, so an install over 3G does not
download it. The main bundle holds only a tiny shim (`monitoring.ts`) that catches errors from
the first moment and queues up to 10 of them.

**Integrations kept.** Default integrations are **off**, and only these four are enabled:

| Integration | Why kept |
|---|---|
| `dedupeIntegration` | Drop repeated identical events |
| `linkedErrorsIntegration` | `error.cause` chains for real diagnosis |
| `functionToStringIntegration` | Readable function names |
| `eventFiltersIntegration` | Ignore browser noise (ResizeObserver, network drops) |

**Integrations rejected:**

| Integration | Why rejected |
|---|---|
| `breadcrumbsIntegration` | Console arguments, clicked element text and fetched URLs (PostgREST filters such as `phone=eq.+231…`) are where personal data hides |
| `supabaseIntegration` | Records database queries |
| `httpClientIntegration` | Request and response data |
| `browserTracingIntegration` and all tracing | Not needed for code-level diagnosis; adds weight and traffic |
| `browserSessionIntegration` | Background network traffic on 3G, and not needed |
| `replayIntegration` and `replayCanvasIntegration` | **Not installed** (see §4) |
| `feedbackIntegration` | The app has its own feedback form |
| `captureConsoleIntegration` | Console output can carry data |

Uncaught errors and unhandled promise rejections are captured by the app's own two
`window` listeners in `monitoring.ts`, so they work before the SDK has loaded.

## 2. Privacy configuration

SDK v11 replaced `sendDefaultPii: false` with per-category `dataCollection` controls. **All
of them are off:**

```ts
dataCollection: {
  userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
  urlQueryParams: false, graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false }, databaseQueryData: false,
  queues: false, stackFrameVariables: false, frameContextLines: 0
}
maxBreadcrumbs: 0, beforeBreadcrumb: () => null
```

**`beforeSend` → `scrubEvent()`** (`client/src/platform/observability/scrub.ts`) processes
every event:
- **Removed:** `user`, `server_name`, all breadcrumbs, request headers, cookies, body and
  query string, stack-frame variables, and source context lines.
- **URLs:** request and frame URLs keep origin and path only.
- **Every string** in the message, exception values, `extra`, `contexts` and `tags` is
  redacted for:
  - JWTs;
  - bearer tokens;
  - Supabase keys;
  - `otpauth://` URIs;
  - base32 TOTP-looking secrets;
  - `key=value` and JSON fields named `token|secret|password|code|otp|email|phone|name|note|…`;
  - email addresses;
  - phone numbers (7+ digits).
- **Keys** that name personal or secret data are set to `[redacted]`.
- **Strings** are truncated at 1,000 characters.

The app never calls `setUser`.

**Context we do send.** This is useful and not identifying:

| Tag | Value |
|---|---|
| `release` | `nevout-meds@<commit>`, from `VERCEL_GIT_COMMIT_SHA` at build |
| `environment` | `production` (or `VITE_SENTRY_ENVIRONMENT`) |
| `route` | The screen id (for example `inventory`), not a URL |
| `role` | `owner` / `staff` / `admin` (a category) |
| `tenant` | A **one-way pseudonym** of the pharmacy id: SHA-256 with a fixed salt, 12 hex characters |
| `device` | phone / tablet / desktop |
| `online` | true / false |
| `area` | render / query / mutation / sync / import / auth |
| `sync.queued` | Number of queued offline changes |

Never used as tags:
- pharmacy names;
- user emails;
- customer names;
- raw ids.

## 3. What is reported, and what is not

**Reported (unexpected failures):**
- React render errors (root error boundary);
- uncaught exceptions;
- unhandled rejections;
- query and mutation failures that are not expected;
- Edge Function faults (5xx);
- sync-engine exceptions, and a server error repeated three times on the same queued change
  (the mutation *type* and codes only, never the payload);
- import saves that fail on the server;
- unexpected Auth failures (for example, the stored session can't be read).

**Not reported (expected behaviour, filtered in `isExpectedError`):**
- wrong password;
- wrong or expired MFA code;
- validation errors;
- duplicates (`23505`);
- constraint refusals;
- permission refusals (`42501`, 401 / 403);
- conflicts and stale versions (409);
- payload too large;
- **anything while the device is offline**;
- network drops (`Failed to fetch`).

Sync *conflicts* are expected domain states that people resolve in "Needs attention". The
health check counts them; Sentry does not.

## 4. Session Replay: off

- **Authenticated pharmacy application: OFF.** It is not only sampled at 0 %: the Replay
  package is **not installed**. The test suite scans every shipped chunk for recorder code
  (`rrweb`, `ReplayContainer`, masking options) and fails if any is present.
- **Public website:** could be evaluated later. It would need a separate decision, sampling
  limited to `/` with no signed-in user, and its own review. It is not enabled.

**Why.** Replay records the DOM. The operational screens *are* the pharmacy's data: customer
names, phones, balances, stock and prices. Masking is error-prone. A missed selector leaks a
customer list, and there is no present diagnostic need that stack traces don't meet.

## 5. Offline and failure behaviour

Monitoring is **never a dependency**:
- every call is fire-and-forget and swallows its own errors;
- the SDK loads only when online, and an SDK load failure is retried later;
- `beforeSend` returns `null` offline, so nothing is queued to disk and nothing is retried
  offline;
- if the endpoint is down or blocked, the app keeps working. This is tested: startup,
  sign-in, inventory and sales all work with the endpoint unreachable, and the app opens
  offline with a DSN set.

## 6. Configuration: public vs secret

| Variable | Where | Public or secret | Purpose |
|---|---|---|---|
| `VITE_SENTRY_DSN` | Vercel → Production (build) | **Public**. A DSN only allows *sending* events; it is in the browser by design. | Turns monitoring on |
| `VITE_SENTRY_ENVIRONMENT` | Vercel (optional) | Public | Defaults to `production` |
| `SENTRY_AUTH_TOKEN` | Vercel → Production, **build only**. **Never `VITE_*`.** | **Secret** | Uploads source maps at build time |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Vercel (build) | Not secret | Source-map upload target |

**Source maps:**
- they are generated **only** when all three build variables are present (`hidden` maps, not
  referenced from the JS);
- they are uploaded by `@sentry/vite-plugin` 5.4.0;
- they are then **deleted from the output** (`filesToDeleteAfterUpload: ["**/*.map"]`), so they
  are never served publicly;
- without the token, no maps are produced at all.

The auth token never reaches the bundle. The test scans for `sntrys_` and
`SENTRY_AUTH_TOKEN`.

**Recommended Sentry project settings** (in the Sentry UI):
- Data Scrubbing on;
- "Prevent storing of IP addresses" on;
- default PII scrubbers on;
- a short retention period (for example 30 days);
- the project region chosen consciously (EU or US).

## 7. Tests

| Suite | Checks |
|---|---|
| `supabase/tests/sentry_privacy.test.mjs` | 38 unit checks: <ul><li>emails, phones, JWTs, bearer tokens, TOTP secrets, `otpauth`, service keys, query parameters and JSON fields redacted;</li><li>user, breadcrumbs, request data and frame vars removed;</li><li>expected versus unexpected classification;</li><li>stable one-way tenant pseudonym.</li></ul> |
| `supabase/tests/ui_sentry.e2e.mjs` | 26 checks in a real browser against a **mock ingest server**: <ul><li>lazy load;</li><li>an uncaught error and an unhandled rejection arrive **scrubbed**;</li><li>wrong password and code, and permission refusals, are **not** sent;</li><li>workspace tags are pseudonymous;</li><li>the endpoint down, then unreachable from startup, then offline: the app keeps working and nothing is sent offline;</li><li>no Replay code; not precached; no auth token; no public source maps.</li></ul> |
