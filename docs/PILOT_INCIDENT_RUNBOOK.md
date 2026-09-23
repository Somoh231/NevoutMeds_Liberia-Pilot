# NevOut Meds — Pilot incident runbook

Small on purpose. Everything below uses data the product already records, so no
observability stack is needed for a pilot. Escalate to a heavier tool only when
pilot volume justifies it.

**Incident owner:** _(assign a named person before go-live — this must not be blank)_
**Backup owner:** _(assign)_
**Pilot hours:** pharmacy opening hours, Liberia (GMT). Out-of-hours = next morning.

> **Before the first real pharmacy:** both owner lines above must name real people, and the
> backup posture in `docs/BACKUP_AND_RECOVERY.md` must be in place. See
> `PILOT_GO_LIVE_CHECKLIST.md`.

**Production:** frontend `https://nevout-meds-liberia-pilot.vercel.app` (Vercel project
`nevout-meds-liberia-pilot`); backend Supabase `qohpyeqyveusnxhnbtxz`; Edge Function
`staff-admin`.

---

## 1. What to watch, and how

| Signal | Where | How to check | Act when |
|---|---|---|---|
| Failed authentication spike | Supabase → Auth → Logs | Filter `status=400` / `invalid_credentials`, group by hour | > 20/hour from one IP, or a user locked out repeatedly |
| Edge Function errors | Supabase → Edge Functions → `staff-admin` → Logs | Look for non-200 responses | any 5xx, or repeated 403 from a legitimate owner |
| Sync failures (device side) | `app_logs` table | `select created_at, message from app_logs order by created_at desc limit 50` | any error repeating for one pharmacy |
| Queue conflicts | Owner's device → sync badge → "Needs attention" | Ask the pharmacy; each entry shows the server's reason | any conflict older than one working day |
| Database / RPC failures | Supabase → Logs → Postgres | Filter `ERROR` | repeated `42501` (permission) or check-constraint failures |
| Storage failures | Supabase → Storage → Logs | Upload errors on the `documents` bucket | any upload failure reported by a pharmacy |
| Application crashes | `app_logs` (the error boundary writes here) | `select message, count(*) from app_logs where level='error' group by 1 order by 2 desc` | same message more than twice |

### Ready-made queries

```sql
-- Errors in the last 24 hours, worst first
select message, count(*) as hits, max(created_at) as last_seen
from public.app_logs
where created_at > now() - interval '24 hours'
group by message order by hits desc limit 20;

-- Pharmacies that went quiet (possible outage or abandonment)
select ph.name, max(e.created_at) as last_activity
from public.pharmacies ph
left join public.app_events e on e.pharmacy_id = ph.id
group by ph.name order by last_activity nulls first;

-- Stock that went negative (must always return zero rows)
select * from public.inventory where stock < 0;

-- Stock must equal the sum of its movements for every product the app manages.
-- Seeded synthetic fixtures (E2E / Pilot pharmacies) are reset directly by the
-- test seeders and are expected to differ; real pharmacies must return zero rows.
select ph.name, pr.name, i.stock, coalesce(sum(m.delta),0) as movements
from public.inventory i
join public.products pr on pr.id = i.product_id
join public.pharmacies ph on ph.id = i.pharmacy_id
left join public.stock_movements m on m.product_id = i.product_id and m.pharmacy_id = i.pharmacy_id
where ph.name not like 'E2E %' and ph.name not like 'Pilot Pharmacy %'
group by 1,2,3 having i.stock <> coalesce(sum(m.delta),0);

-- Sales must always carry a currency (0018)
select count(*) from public.purchases where currency_code is null;

-- Country / currency / settings changes (who, what, when)
select changed_at, pharmacy_id, field, old_value, new_value
from public.pharmacy_config_changes order by changed_at desc limit 20;

-- Duplicate-looking purchases (idempotency sanity check)
select pharmacy_id, customer_id, amount, purchased_at, count(*)
from public.purchases
group by 1,2,3,4 having count(*) > 1;

-- Staff lifecycle actions in the last week
select created_at, actor_email, action, target_email
from public.staff_audit_log
where created_at > now() - interval '7 days' order by created_at desc;
```

## 2. First response by symptom

**"I can't sign in"**
1. Is the account suspended? `select status from users_profiles where id = …`
2. Is it banned in Auth (suspension bans the identity)? Supabase → Auth → Users.
3. If suspended in error: owner reactivates from the Staff screen (this also unbans).
4. If the password is forgotten: **"Forgot password" does not work yet**. Production SMTP is not
   configured (see `PILOT_GO_LIVE_CHECKLIST.md`), so no reset email is sent. Until SMTP is live,
   escalate to the incident owner. Never set or share a password for a user, and never send
   passwords over WhatsApp.

**"My sales are not showing on the other phone"**
1. Check the sync badge on the device that recorded them. Offline or "Waiting to sync" is expected behaviour, not data loss.
2. Reconnect the device; the queue drains automatically.
3. If it says "Needs attention", read the reason — usually a suspended account or a rejected value.

**"The stock number looks wrong"**
1. `select * from stock_movements where product_id = … order by occurred_at desc limit 20;` — every change is recorded with who made it.
2. Compare with `inventory.stock`. They must agree with the sum of movements.
3. Never edit `inventory` directly; correct it with a stock adjustment so the audit trail stays honest.

**"Nothing loads at all"**
1. Check Supabase status (project dashboard).
2. Check the Vercel deployment is serving.
3. Pharmacies can keep working offline if they loaded data earlier — tell them so; their work queues.

**"The sale won't sync: it says the currency doesn't match"**
1. The sale was priced in one currency but the pharmacy now records sales in another. This only
   happens if the country or currency was changed before the first sale while a device was
   offline. The server refuses to re-label it, by design.
2. Check the pharmacy's configuration history in `pharmacy_config_changes` (query above).
3. Have the pharmacy re-enter the sale in the current currency, then dismiss the conflicted item.

**"I can't change the country or currency in Settings"**
1. That's expected once any sale exists: recorded amounts keep the currency they were entered in.
2. A genuinely mis-onboarded pharmacy can only be corrected by the platform operator, from a
   direct database session using `nevout.country_change_override` (see
   `docs/country/CURRENCY_MODEL.md`), after exporting its data. **Never** do this through the API.

**"Today's sales are on the wrong day"**
1. Business days follow the pharmacy's timezone (Africa/Monrovia for Liberia, UTC+0), not the
   phone's clock.
2. Check `select timezone from pharmacies where id = …`. It should be `Africa/Monrovia`.

**Suspected security problem (wrong pharmacy's data visible)**
1. Treat as urgent. Capture screenshots and the user's email.
2. `select * from staff_audit_log where pharmacy_id = … order by created_at desc;`
3. Suspend the affected account (Staff screen) — this cuts access immediately, even on a live session.
4. Do not "fix" it by loosening RLS.

## 3. Escalation

1. Incident owner triages within one working day (same hour for security or data-loss reports).
2. Security, data loss or cross-tenant exposure → stop new pilot onboarding until resolved.
3. Record every incident (date, pharmacy, symptom, cause, fix) in this file's log below.

## 4. Incident log

| Date | Pharmacy | Symptom | Cause | Fix |
|---|---|---|---|---|
| _(empty — first pilot incident goes here)_ | | | | |
