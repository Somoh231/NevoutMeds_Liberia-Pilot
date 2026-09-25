# Patient portal: roadmap architecture (conceptual only)

**Status: NOT implemented and NOT in scope.** NevOut Meds is a tool for pharmacy staff.
Customers do not sign in. This records how a patient-facing surface would be approached, so
that nothing built now makes it unsafe later.

## 1. A possible first version

| Feature | Notes |
|---|---|
| Refill requests | The patient asks; the pharmacy approves. This mirrors today's refill reminders. |
| Order / prescription status | "Received → being prepared → ready" |
| Ready-for-pickup notifications | WhatsApp or SMS first (the pilot's channel), then push |
| Receipts | For the patient's own purchases only |
| Communication preferences | Channel, language, opt-out |
| Secure messages with the pharmacy | Threaded, retained, never used for emergencies |

## 2. The rule that must not be broken

**Patient authorization is separate from staff RBAC.** A patient is **not** another staff
role, and must never be added to `public.user_role` or `private.role_capabilities`.

| | Staff (today) | Patient (future) |
|---|---|---|
| Identity | Supabase Auth user **with** a `users_profiles` row (pharmacy, role, status) | A separate identity: its own table (for example `patient_accounts`) linked to one or more `customers` rows **per pharmacy**, only after the pharmacy verifies them |
| Scope | Everything their capabilities allow in **one pharmacy** | **Only their own** records (row-level: `customer_id in (my verified links)`) |
| Tenant helpers | `private.pharmacy_id()`, `has_capability()` | Must return **nothing** for a patient: a patient must never pass a staff helper |
| MFA | Required for owners and admins | Separate policy (likely an OTP to a verified phone, with a step-up for sensitive actions) |
| App | The workspace (`/platform`) | A separate app or route tree with its own service-worker scope, its own bundle, and its own CSP |

## 3. The privacy and security boundary that would change

Today, the only people who can read customer data are **staff of that customer's pharmacy**.
A portal would add:

1. **Self-access to health-adjacent data** (purchases, medicines) from the public internet.
   That means rate limiting, account-takeover protection, and a verified link between person
   and customer record. Matching by phone alone is not enough: shared phones are common.
2. **Cross-pharmacy identity.** One person can be a customer of two pharmacies. The portal link
   must be per pharmacy, and **must not** let pharmacy A see that the person also uses
   pharmacy B.
3. **Consent and data rights:** access requests, correction, deletion, and consent to
   messaging.
4. **Minors and proxies** (a parent collecting for a child) need an explicit proxy model.
5. **Monitoring.** Patient screens would need their own review. Session replay would stay
   off (Sentry policy §4).
6. **Legal.** In the U.S. this is PHI under HIPAA (see the e-prescribing document on BAAs).
   Elsewhere, national data-protection law applies, and the pilot agreement would need
   updating.

## 4. What today's design already does right

- Customer rows are tenant-scoped. RLS and the capability helpers derive the tenant only from
  a staff profile, so a new identity type cannot inherit staff reach by accident.
- `user_metadata` is never used for authorization. A self-registered patient therefore can't
  claim a role.
- Security events and the audit log are append-only, which gives a pattern for portal access
  logs.
