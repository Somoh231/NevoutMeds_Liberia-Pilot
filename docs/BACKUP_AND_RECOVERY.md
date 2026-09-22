# NevOut Meds — Backup and recovery

Honest position first: **this has not been tested against the production project, because nothing has
been deployed yet.** What follows is the plan, what each Supabase plan actually gives you, and what
must be proven before a real pharmacy depends on it.

---

## 1. What Supabase provides, by plan

| Plan | Automated backups | Retention | Point-in-time recovery | Self-serve restore |
|---|---|---|---|---|
| **Free** | Daily backups are **not guaranteed**; the project is also paused after ~1 week of inactivity | none to rely on | no | no |
| **Pro** | Daily automated backups | 7 days | available as a paid add-on | yes, from the dashboard |
| **Team / Enterprise** | Daily + PITR | longer | yes | yes |

**Statement required by the brief:** the **Free plan cannot support an acceptable production backup
posture** for a pharmacy pilot. Daily backups are not guaranteed, there is no point-in-time recovery,
and the project can be paused for inactivity — which would take a pharmacy offline without warning.

**Recommendation: move `qohpyeqyveusnxhnbtxz` to Pro before any real pharmacy data is entered.** For a
single pilot project this is the cheapest meaningful risk reduction available.

Verify the current plan in the dashboard (Settings → Billing) before go-live; I could not check it
from here because nothing is deployed and I have not touched the remote project.

## 2. What must be backed up

| Data | Covered by Supabase DB backup | Notes |
|---|---|---|
| All pharmacy business data (`public` schema) | ✅ | purchases, inventory, customers, movements, audit log |
| Auth users | ✅ (`auth` schema) | passwords are hashes; users do not need recreating |
| Storage objects (documents bucket) | ⚠️ **separate** | database backups do **not** include storage files |
| Edge Function code | ❌ | lives in this git repository |
| Configuration (auth settings, secrets) | ❌ | recorded in `docs/PRODUCTION_DEPLOYMENT_INVENTORY.md` |

So a complete recovery = **database backup + storage copy + this repository + the configuration
inventory**. Any plan that only covers the first one is incomplete.

## 3. Independent backup (works on any plan, and worth doing anyway)

Run from a trusted machine, not from a pharmacy device:

```bash
# Schema + data, roles excluded (Supabase manages those)
supabase db dump --linked --file backup_$(date +%F).sql          # schema
supabase db dump --linked --data-only --file data_$(date +%F).sql # data

# Storage: copy the documents bucket (requires the service-role key, server-side only)
# Use the Storage API or the dashboard; there is no single CLI command for this today.
```

Keep dumps encrypted and off the laptop that runs them. A pharmacy's customer list is personal data.

## 4. Restore procedure (must be rehearsed before go-live)

1. Create a **new** Supabase project (never restore over a live one while diagnosing).
2. `supabase db push` to apply migrations `0001` → `0017`.
3. Restore data: `psql "$DATABASE_URL" -f data_<date>.sql`.
4. Re-upload storage objects into the `documents` bucket, preserving the `<pharmacy_id>/` prefixes.
5. Re-apply auth configuration and Edge Function secrets from the deployment inventory.
6. Deploy `staff-admin`.
7. Point the frontend at the new project (`VITE_SUPABASE_URL`, anon key) and redeploy.
8. Verify: sign in, read a pharmacy's data, record a sale, confirm stock moves, confirm no
   cross-tenant leakage (`select count(*) from customers` as two different pharmacies).

## 5. Expectations to agree with the pilot pharmacies

| Measure | Free plan (current) | Pro plan (recommended) |
|---|---|---|
| **RPO** (data you could lose) | **undefined — up to everything** | up to 24 h, or minutes with PITR |
| **RTO** (time to restore) | undefined | ~1–4 h for a project of this size, once rehearsed |
| Who declares an incident | incident owner (see runbook) | same |
| Who performs the restore | incident owner + one backup person | same |

Do not quote an RPO/RTO to a pharmacy until a restore has actually been rehearsed once.

## 6. A genuine mitigation already in the product

Because every device keeps an IndexedDB cache and a durable mutation queue, a **backend outage is not
immediate data loss**: pharmacies keep selling offline and their work syncs when the service returns.
That protects against downtime, **not** against a destructive data loss on the server — only backups
do that.

## 7. Open items before go-live

- [ ] Confirm (and if necessary upgrade) the Supabase plan for `qohpyeqyveusnxhnbtxz`
- [ ] Take the first database dump and store it securely
- [ ] Decide and document the storage-bucket backup method
- [ ] **Rehearse a full restore into a scratch project** and record the actual RTO
- [ ] Name the incident owner and the backup owner in the runbook
