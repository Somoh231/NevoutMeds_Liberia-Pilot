# Secure owner provisioning (while SMTP is unavailable)

Production can't send email yet (SMTP is **OPEN**), so a new owner can't complete the normal
sign-up confirmation. This is the temporary, controlled way to give an owner their account. It
changes nothing else: **email confirmation stays on for everyone else.**

## The rules

| Rule | Why |
|---|---|
| **Verify the person before provisioning:** in person, or on a call **you** placed to a number you already trust. Record how in the intake form. | The setup link is the key to the account. It only goes to the verified person. |
| **You never choose, see, type or send a password** | The owner sets their own password from the link |
| **The link is single-use and expires in 1 hour** | A leaked old link is useless |
| **Send the link only to the verified WhatsApp number**, never to a group or by SMS to an unverified number | |
| **The account alone grants nothing.** The owner becomes owner only by creating their pharmacy in onboarding, which the server records. Staff join only through the owner's invitations. | No manual role assignment exists or is needed |
| **The script runs only on the operator's machine** with the service-role key file (chmod 600) | The key must never be pasted into chats, documents, the browser or screenshots |

## Setup (one time, on the operator's machine)

```bash
export NEVOUT_SUPABASE_URL=https://qohpyeqyveusnxhnbtxz.supabase.co
export NEVOUT_SERVICE_ROLE_KEY_FILE=/path/to/service-role-key   # chmod 600; obtained from the Supabase dashboard by the account owner
```

## Provision an owner

1. **Dry run** (shows what will happen and changes nothing):
   ```bash
   node ops/provision/provision-owner.mjs --email owner@example.com --name "Owner Full Name" --app-url https://nevout-meds-liberia-pilot.vercel.app
   ```
2. **Confirm** you have verified the person, then run it again with `--yes`:
   ```bash
   node ops/provision/provision-owner.mjs --email owner@example.com --name "Owner Full Name" --app-url https://nevout-meds-liberia-pilot.vercel.app --yes
   ```
   It prints a **password-setup link**. Copy it into the WhatsApp chat with the verified owner
   **and nowhere else**. Don't save it in notes. The script logs the action in
   `ops/provision/provision.log`, without the link.
3. **The owner opens the link** on their own device within the hour:
   1. they choose a password (8+ characters);
   2. they reach **"Set up your pharmacy"** and complete it (country **Liberia**, currency, name).
      This creates the pharmacy and makes them its owner, **on the server**.
4. **Verify** (read-only):
   ```bash
   node ops/provision/check-account.mjs --email owner@example.com
   ```
   Expect:
   - `email confirmed: yes · has signed in: yes`
   - `pharmacy: <their pharmacy> · LR · <currency> · business day Africa/Monrovia`
   - `role: owner · status: active`
   - `members (1)`
5. **Login test:** the owner signs out, then signs back in with their email and password.
   The header shows their pharmacy name.
6. **Wrong-tenant check:** the owner's workspace shows only their own pharmacy name and their own
   products and customers.
   - With one pilot pharmacy there is no second real tenant to probe. Cross-pharmacy access is
     blocked by the server, and this is proven by the automated isolation suite
     (`api_tenant_isolation`, 41 checks; run on production before cleanup).
   - Before a **second** pharmacy is onboarded, repeat that suite on staging (`STAGING_SETUP.md`).

## Provision a staff member (only if they have no account yet)

Staff normally join from the owner's invitation. Creating a new account from the invitation needs
email, so while SMTP is unavailable:

1. **The owner** invites them in the app first (Staff → Invite a team member).
2. **The operator** verifies the staff member, then runs:
   ```bash
   node ops/provision/provision-owner.mjs --email staff@example.com --name "Staff Full Name" --app-url https://nevout-meds-liberia-pilot.vercel.app --for staff --yes
   ```
3. **The staff member:**
   1. opens the setup link and sets their password;
   2. opens the **owner's invitation link**, chooses **"I have an account"** and signs in.
   The invitation decides their pharmacy and role; the script gives none.
4. **Verify:** `check-account.mjs --email staff@example.com` shows `role: staff · status: active`
   in the right pharmacy.

## What to do if…

| Situation | Action |
|---|---|
| **The setup link expired** (more than 1 hour) or was never opened | Verify the person again, then: `provision-owner.mjs --email <same> --app-url <url> --new-link --yes`. The script only issues new links for accounts that have **never signed in and have no pharmacy**. |
| **The owner lost the link** | Same as "expired". The old link stops working once a new one is issued or it expires. |
| **The wrong email was entered** | Tell the owner **not** to use that link. Provision again with the right email. The unused wrong account holds no pharmacy and no data. Record it in the incident log, and ask Technical Support to delete it from the Supabase dashboard (Authentication → Users). **Never reuse it for someone else.** |
| **"An account for … already exists"** | The script refuses. Run `check-account.mjs`. If it shows `has signed in: no` and no pharmacy, use `--new-link`. If the person already uses it, they sign in normally. |
| **"has already signed in or belongs to a pharmacy. A new setup link is not issued for active accounts."** | This is the forgot-password case below |
| **The owner forgot their password while SMTP is unavailable** | **There is no safe self-service reset until SMTP is live.** Don't set a password for them, and don't disable email confirmation. Escalate to the **Incident Owner (TBD)**: a P1 if it stops the pharmacy working. Staff can keep selling on their own accounts meanwhile. Configuring SMTP is the real fix (`docs/STAFF_AUTH_ARCHITECTURE.md`). |
| **A staff member forgot their password** | Same rule. Meanwhile the owner can **Suspend** them in Staff if the device is lost. |
| **A phone with a signed-in account is lost** | The owner suspends that person in Staff: access stops immediately, even on the lost phone. Owner's own phone lost: P0; contact support. |

## Never

- Share, set or reset anyone's password.
- Send a setup link to anyone other than the verified person.
- Paste the service-role key or setup links into WhatsApp groups, documents, tickets or
  screenshots.
- Turn off "Confirm email" in Supabase as a shortcut.
