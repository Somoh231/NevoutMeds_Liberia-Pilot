# Staff and authentication architecture

## Principles

- **An account grants nothing on its own.** Pharmacy and role come only from:
  - **onboarding**, where an owner creates their own pharmacy; or
  - an **invitation** validated server-side, which puts staff into an owner's pharmacy.
- **Privileged actions** (invite, suspend, reactivate, remove, change role) run in the
  `staff-admin` Edge Function or security-definer RPCs. The browser never holds a service key.
- **Every action is audited** in `staff_audit_log`, which nobody can rewrite and other pharmacies
  can't see.
- **Suspension is immediate.** It cuts a live session, bans the identity, and makes queued offline
  work come back as "Needs attention" instead of syncing.

## Flows

| Flow | Path | Email needed? |
|---|---|---|
| Owner signs up | `/login` → Create account → confirm email → `/onboarding` (country first) → workspace | **Yes, while "Confirm email" is on** |
| Owner provisioned by operator (pilot fallback) | `ops/provision/provision-owner.mjs` → single-use setup link → `/reset-password` (owner sets own password) → `/onboarding` | **No** |
| Staff invited | Owner: Staff → Invite → WhatsApp link. Staff opens `/accept-invite?token=…` and either signs in (existing account) or creates an account. | Creating an account needs email confirmation. Signing in doesn't. |
| Staff account provisioned by operator (pilot fallback) | `provision-owner.mjs --for staff` → setup link → staff sets password → opens the owner's invitation → "I have an account" | **No** |
| Password reset | `/forgot-password` → email link → `/reset-password` | **Yes** (SMTP) |
| Suspend / reactivate / remove / change role | Owner: Staff screen → `staff-admin` | No |

## SMTP status: OPEN

| Item | State |
|---|---|
| Production SMTP | **Not configured** (TBD provider). The built-in Supabase mailer is rate-limited: a signup on 2026-09-23 returned `over_email_send_rate_limit`. |
| Email confirmation | **Kept ON**, deliberately. It is not disabled as a shortcut. |
| Password recovery | **Not production-ready** until SMTP exists. |
| App readiness | Ready for SMTP, with no code change needed when credentials arrive (below) |

**What the app already does correctly, verified in code and tests:**

| Area | Behaviour |
|---|---|
| Owner signup | `emailRedirectTo = <origin>/onboarding`. The UI shows "Check your email" when confirmation is required. |
| Invitation signup | `emailRedirectTo = <origin>/accept-invite?token=…`, so the confirmation link returns to the same invitation, which is then accepted automatically. The UI shows a "Check your email" state (fixed 2026-09-23: previously the page gave no feedback). |
| Password reset | `redirectTo = <origin>/reset-password`. The page waits for the link's session, then offers a new-password form, with a clear expired-link state. |
| Email delivery failure | Shows "We couldn't send the email right now. Try again later, and if it keeps happening, contact NevOut Meds support…". It no longer shows a misleading "wait a minute" (fixed 2026-09-23). |
| Invitation links | Built by `staff-admin` from `NEVOUT_APP_ORIGIN` / `NEVOUT_ALLOWED_APP_ORIGINS`, verified to be the canonical URL. |

**When SMTP credentials arrive:**

1. **Configure SMTP.** Dashboard → Authentication → Emails → SMTP: host, port, user, API key or
   password, and a sender on a verified domain.
2. **Check the redirect allow-list** (Authentication → URL configuration). It must include
   `https://nevout-meds-liberia-pilot.vercel.app/**`. That covers `/onboarding`,
   `/accept-invite?token=…` and `/reset-password`. Without the wildcard, confirmation links fall
   back to the Site URL root, which still works but is less direct.
3. **Check the templates** (Authentication → Email templates). The defaults use
   `{{ .ConfirmationURL }}`, which is correct; only the wording needs to change.
4. **Verify on staging first, then on production with a real mailbox:**
   - signup → confirm → onboarding;
   - invite → create account → confirm → accepted;
   - forgot password → reset.

## Pilot provisioning fallback (no SMTP)

`ops/provision/provision-owner.mjs` was tested end to end: `ui_owner_provisioning.e2e.mjs`,
**10/10**.

**Why it doesn't weaken authentication:**
- Email confirmation stays on for everyone else.
- The operator never sets, sees or sends a password.
- The operator verifies identity out of band first.
- The setup link is single-use and expires (OTP expiry, 1 hour by default).
- The link travels only over the verified channel.
- The account alone grants nothing.
- The script refuses to re-provision existing accounts, and refuses new links for accounts
  already in use.
- Every action is logged locally in `ops/provision/provision.log`, with no links or secrets.

It needs the service-role key and must be run by the platform operator on their own machine.
**It is a controlled-pilot procedure, not a product feature.** Replace it with normal email flows
once SMTP is configured.
