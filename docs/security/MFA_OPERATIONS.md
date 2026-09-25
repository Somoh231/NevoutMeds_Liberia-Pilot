# Two-step verification (MFA): operations

Phase 11. TOTP authenticator apps on **Supabase Auth** (free on all plans, enabled by
default on hosted projects). NevOut Meds does not implement OTP itself:
- **Supabase Auth** generates and stores the secret, issues the QR code, verifies every
  code, and signs the resulting assurance level (`aal`) into the session JWT;
- **the app** only calls `auth.mfa.*`;
- **the database** only reads the signed `aal` claim.

## 1. Policy

| Role | MFA | Where it is decided |
|---|---|---|
| Pharmacy owner | **Required** | `private.mfa_policy` (server) |
| Platform admin | **Required** | same |
| Staff | Optional. Once a staff member enrolls, it is required for them. | same, plus `auth.mfa_factors` (verified) |

To make MFA mandatory for everyone later:

```sql
update private.mfa_policy set mfa_required = true;
```

Also update the mirror `MFA_REQUIRED_ROLES` in `client/src/platform/auth/capabilities.ts`; the
parity test enforces this.

**Enforcement is in the database.** `private.mfa_satisfied()` sits inside the helpers every RLS
policy and RPC uses, so it covers:
- PostgREST;
- RPCs;
- Storage;
- the `staff-admin` Edge Function, which calls RPCs with the caller's JWT.

An owner holding only a password (`aal1`) reaches **no** pharmacy data at all, not merely
"no admin actions". The React screen is the friendly face of a rule the server already
applies.

**Sensitive actions.** Staff role changes, suspension, reactivation, offboarding, MFA resets,
pharmacy settings and invitations are owner capabilities. Owners always act at `aal2`, so all
of these already require MFA. Removing a verified factor requires `aal2` in Supabase Auth
itself.

## 2. What people see

| Moment | Screen |
|---|---|
| Owner's first sign-in (or first after a reset) | "Protect your pharmacy". Three numbered steps: get an app, scan the QR code or type the key, enter the 6-digit code. Then a confirmation with lost-phone advice. The workspace opens after **Continue**. |
| Every later sign-in | Password, then "Enter your code". One numeric field that accepts paste and autofill. **Lost your phone?** explains the supervised recovery. There is no bypass. |
| Account menu → **Account security** | Status (On / Off / Required · not set up). **Set up authenticator**, **Replace** (the new app is confirmed before the old one is removed), and **Remove** (only where MFA is optional, or when another factor remains). Change password, Sign out, and security activity. |
| Staff screen (owner) | **Reset two-step** on a team member, after a confirmation that asks the owner to verify identity first |

**Offline:**
- A session that already passed MFA stays `aal2` across refreshes and keeps working offline.
- A code cannot be *checked* offline, so the code screen says so.
- Queued offline work is replayed only once the session is strong enough.

**Never stored by the app:**
- the secret;
- the QR payload;
- any code;
- any "verified" flag.

The key and QR code live only in the setup component's memory until confirmation.

## 3. Audit events (`public.security_events`, append-only)

| Event | Recorded by | Notes |
|---|---|---|
| `mfa_enrollment_started` | app → `record_security_event` | Validated: an **unverified** factor with that id must exist for the caller |
| `mfa_factor_verified` | app | Validated: the factor must be **verified** |
| `mfa_factor_removed` | app | Validated: the factor must no longer exist |
| `mfa_challenge_failed` | app | Wrong code; rate-limited (30 events per hour per user) |
| `mfa_required_not_enrolled` | server (`my_security_posture`) | At most once every 24 hours per person |
| `mfa_admin_reset` | server: `reset_member_mfa` (actor `owner`) or `ops/security/reset-mfa.mjs` (actor `operator`, with ticket) | Also written to `staff_audit_log` (`mfa_reset`) for owner resets |

**Never recorded:**
- secrets;
- `otpauth://` URIs;
- QR data;
- codes;
- passwords;
- tokens.

This is tested in `70_capabilities_mfa.test.sql` and `api_mfa.e2e.mjs`.

**Who can read events:**
- everyone reads their own;
- owners read their pharmacy's (`staff.audit.read`);
- admins read all.

Nobody can edit or delete them. Supabase Auth also keeps its own audit log of factor events.

## 4. Lost authenticator: recovery procedures

**Password recovery and MFA recovery are different things.**
- **Password recovery:**
  - *normally:* a password-reset email;
  - *while SMTP is pending:* the operator's single-use setup link, as in
    `ops/provision/provision-owner.mjs --new-link`, which only works for accounts not yet in
    use.
- **MFA recovery:** always a supervised **reset of the factor**, done by someone other than
  the person. A reset removes the second factor, so it is never self-service and never done
  on an unverified request.

There are **no recovery codes and no security questions.** Supabase does not issue backup
codes. Security questions are guessable, and a code sheet kept next to the till is not a
second factor.

### 4.1 Staff member lost their phone, deleted the app, or changed device

1. The staff member tells their **pharmacy owner** in person.
2. The owner confirms who is asking: face to face, or by calling back a number already on
   file. **Never on the strength of an inbound message alone.**
3. The owner opens **Staff**, finds the member, chooses **Reset two-step**, and confirms.
4. The member signs in with their password. MFA is optional for staff, so they can set up a
   new app from **Account security**.

This is recorded as `mfa_admin_reset` (actor `owner`) and `staff_audit_log.mfa_reset`.

### 4.2 Owner (or admin) lost their authenticator, or their account is locked out

The pharmacy owner can't be reset by anyone in the pharmacy. **NevOut support** does it:
1. Open a support ticket (`docs/pilot/SUPPORT_ISSUE_TEMPLATE.md`). Treat it as **P1**, since
   the owner can't work.
2. **Verify identity out of band**, using one of:
   - in person with ID at the pharmacy;
   - a callback to the phone number recorded at onboarding
     (`docs/pilot/PILOT_INTAKE_TEMPLATE.md`), **not** a number supplied in the request.
3. Check the account is **active**. The tool refuses suspended and removed accounts:
   restoring access is not what an MFA reset is for.
4. On the operator machine (service-role key file, chmod 600), run:

   ```bash
   NEVOUT_SUPABASE_URL=https://<project>.supabase.co NEVOUT_SERVICE_ROLE_KEY_FILE=~/nevout/service.key \
     node ops/security/reset-mfa.mjs --email owner@example.com --ticket SUP-123 --verified-by "callback to number on file"
   ```

   Review the summary: name, role, pharmacy and factor count. Then re-run with `--yes`.
5. The tool does four things:
   - deletes the factors through the Supabase Auth admin API;
   - records `mfa_admin_reset` (actor `operator`, with the ticket and verification method),
     which the owner sees in Security activity;
   - appends a line to `ops/security/security-ops.log` (gitignored, chmod 600);
   - refuses staff accounts, which their owner resets instead.
6. Tell the owner: at their next sign-in, they set up a new app before the workspace opens.

**Sessions on the lost device.** Any session still open elsewhere drops to `aal1` at its next
token refresh, within the one-hour token lifetime. For an owner, `aal1` means no pharmacy data.
If the device may be **stolen** rather than lost, also change the owner's password (§4.3).

### 4.3 Suspected account compromise

1. Suspend the account: another owner uses **Staff → Suspend**, or NevOut support applies an
   operator ban. Access stops at once.
2. Reset the password using the password-recovery path above.
3. Reset MFA (§4.1 or §4.2).
4. Reactivate the account.
5. Review **Security activity** and the team log for what happened in between.

### 4.4 Checklist for support staff

- [ ] The identity check was **out of band** (in person, or a callback to the number on file).
- [ ] The ticket number is recorded.
- [ ] The account is active and belongs to the pharmacy that asked.
- [ ] You never asked for, or wrote down, a code, password or key.
- [ ] The person knows to set up a new app, and to turn on their app's own cloud backup.

## 5. Configuration

| Where | Setting | Value |
|---|---|---|
| Supabase (hosted) → Authentication → Multi-Factor | App Authenticator (TOTP) | **Enabled.** This is the default on hosted projects; verify it before go-live (checklist). |
| `supabase/config.toml` (local) | `[auth.mfa.totp] enroll_enabled / verify_enabled` | `true` (was `false` before Phase 11) |
| Supabase → Authentication → Multi-Factor | Phone MFA | Off (not used) |
| Database | `private.mfa_policy` | owner and admin required, staff optional |

## 6. Tests

| Suite | Checks |
|---|---|
| `api_mfa.e2e.mjs` | 35 checks with real Supabase Auth: <ul><li>aal1 denied on PostgREST, RPC and Edge Function;</li><li>wrong code (422);</li><li>fake challenge and fake factor;</li><li>aal2 after a correct code;</li><li>refresh keeps aal2;</li><li>sign-out revokes refresh;</li><li>aal1 cannot remove a verified factor;</li><li>first-time privileged enrollment;</li><li>staff opt-in;</li><li>owner reset via Edge Function, with its refusals;</li><li>no secrets in the log.</li></ul> |
| `ui_mfa.e2e.mjs` | 43 checks in the real app: <ul><li>the code screen: a11y, wrong code, reload, offline, lost phone;</li><li>Account security at 360, 430, 768 and 1366 px (axe, no pan, no small text);</li><li>owner cannot remove their last factor;</li><li>staff opt-in through the UI and keyboard-only sign-in;</li><li>staff removal;</li><li>owner reset from Staff;</li><li>no MFA flag in `localStorage`;</li><li>the browser's aal1 token reaches no data.</li></ul> |
| `ui_owner_provisioning.e2e.mjs` | A new owner must set up MFA before the workspace; setup through the real screen; a password alone reaches no data |
| `ui_foundation.e2e.mjs` | Keyboard-only sign-in including the code step |
| `70_capabilities_mfa.test.sql` | Gate semantics at the SQL level (aal1 / aal2, optional staff, unverified factors, suspended users) |
