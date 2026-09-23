# Pilot operator guide

For the person running the controlled Liberia pilot day to day. Technical detail lives in the
linked documents. Incidents are handled in [PILOT_INCIDENT_RUNBOOK.md](PILOT_INCIDENT_RUNBOOK.md).

**Operator / incident owner:** TBD · **Backup owner:** TBD

## Daily (5 minutes)

1. `node ops/monitor/health-check.mjs`, or read the scheduled job's output. It must say HEALTHY.
   For any alert, see [MONITORING.md](MONITORING.md).
2. Confirm last night's backups exist:
   - `ls -t $NEVOUT_BACKUP_DIR | head`
   - the `backups:` line of the health check shows age < 26 h.
3. Look at "silent 48 h" pharmacies. A pilot pharmacy with no activity for two days deserves a
   call.

## Weekly

- `ops/backup/verify-backup.sh <newest database artifact>` must print `"ok":true`.
- Skim `app_logs` for recurring messages (query in MONITORING.md).
- Check `pharmacy_config_changes` for unexpected settings changes.

## Onboarding a pilot pharmacy

1. **Agree the pilot terms first.** Personal-data handling is covered (see
   `docs/country/REGULATORY_RESEARCH_BACKLOG.md` X8). Tell the pharmacy not to record diagnoses in
   free-text notes.
2. **Create the owner account:**
   - **With SMTP configured:** the owner signs up at `/login` → confirms the email → onboarding.
   - **Without SMTP** (the pilot fallback):
     1. Verify the owner in person or by a call you made.
     2. Run:
        ```bash
        node ops/provision/provision-owner.mjs --email <owner email> --name "<full name>" --app-url https://nevout-meds-liberia-pilot.vercel.app --yes
        ```
     3. Send the printed link **only** over the verified WhatsApp number. It expires in about an
        hour and works once.
3. **The owner completes onboarding:**
   - Country: **Liberia**.
   - Currency: **US$**, or L$ if they price in Liberian dollars. **Currency can't change after
     the first sale.**
   - Pharmacy name and contact.
4. **Import or add products.** Import accepts spreadsheets. Check prices are in the chosen
   currency.
5. **Staff:**
   - The owner invites each staff member (Staff → Invite) and sends the WhatsApp link.
   - A staff member without an account needs email confirmation (SMTP). Without SMTP, provision
     them first:
     ```bash
     node ops/provision/provision-owner.mjs --email <staff email> --name "<name>" --app-url https://nevout-meds-liberia-pilot.vercel.app --for staff --yes
     ```
     They set a password, then open the owner's invitation and choose "I have an account".
6. **Walk through with the pharmacy:**
   - a sale;
   - an offline sale (turn off data, sell, turn data on, watch it sync);
   - a stock adjustment;
   - a reminder;
   - a supplier price.

## Common support requests

| Request | Answer / action |
|---|---|
| "I forgot my password" | **Until SMTP is live, reset emails aren't delivered.** Verify the person, then issue a new setup link with `--new-link`, but only for accounts that never signed in. For an active account, escalate to the incident owner. There's no safe self-service path until SMTP exists. **Never set a password for anyone.** |
| "My sale isn't on the other phone" | Check the sync badge on the phone that made the sale. Waiting to sync means it's still offline. "Needs attention" shows the server's reason. |
| "It says the currency doesn't match" | The pharmacy's currency changed after that sale was queued. Re-enter the sale; see the runbook. |
| "I can't change the country / currency" | Expected after the first sale. Recorded amounts keep their currency. |
| "The dates look a day off" | Business days follow Liberia time (Africa/Monrovia), not the phone's clock. Check the phone's own clock too. |
| "Add a staff member" | The owner uses Staff → Invite. See step 5 if SMTP isn't configured. |
| "Remove a staff member now" | The owner uses Staff → Suspend. It takes effect immediately, even on a signed-in phone. |

## Before the first real pharmacy data

See [../PILOT_GO_LIVE_CHECKLIST.md](../PILOT_GO_LIVE_CHECKLIST.md). In particular:

- the **independent backup must be scheduled and restore-tested against production**;
- the owners must be named.
