## Phase 7 — Pilot execution support report

### Pilot-ready now
- **Admin Pilot Console** (`/admin`, admin-only)
  - Per-pharmacy overview: user counts, last seen, last purchase, last inventory change, errors (24h)
  - Usage snapshot: DAU (24h), purchases (24h), inventory adjustments (24h), top modules
  - Recent error feed from `app_logs`

- **In-app feedback** (Platform header → **Help**)
  - Report issue
  - Request feature
  - Quick satisfaction rating (1–5)
  - Stored in Supabase table `app_feedback`

- **Usage analytics (lightweight)** stored in Supabase table `app_events`
  - Route views (`route_view`)
  - Module views (`module_view`)
  - Purchases recorded (`purchase_recorded`)
  - Inventory adjustments (`inventory_adjusted`)

- **Support tools**
  - Contact support link (mailto)
  - WhatsApp help button (pre-filled message)
  - FAQ placeholder

### Still needs field testing / follow-ups
- **Admin console data quality**
  - Ensure `admin_pilot_overview` and `admin_usage_snapshot` RPCs run with correct permissions in your Supabase project (after migrations applied).
  - Confirm last-seen timestamps update reliably under real mobile/network conditions.

- **Error logging**
  - `app_logs` collection is best-effort; verify it works across common failure modes (offline, token expiry).
  - Add rate limiting / sampling if errors become noisy.

- **Impersonation**
  - Disabled by default (safe). Implement only with a server-side service-role workflow (never from client anon key).

### Migrations added (apply in Supabase)
- `supabase/migrations/0008_pilot_telemetry_admin_console.sql`
- `supabase/migrations/0009_admin_usage_metrics.sql`

