# Pilot stop conditions

**Pausing** means:
- tell the pharmacy to switch to their previous method (paper book or spreadsheet) for new
  work;
- stop onboarding anyone else;
- investigate.

It does **not** mean deleting anything. The **Incident Owner (TBD)** decides to pause, and
decides to resume. Until an Incident Owner is named, the pilot must not start (see the master
checklist).

## Pause the pilot immediately if

| # | Condition | How it would show up | First actions |
|---|---|---|---|
| **S1** | **Tenant data leakage:** any user sees another pharmacy's data, or can act on it | A user report; the header shows another pharmacy name; unknown customers or products | Suspend the affected accounts (Staff → Suspend); capture screenshots and times; **do not loosen access rules**; Technical Support investigates. See the runbook, "Suspected security problem". |
| **S2** | **Unexplained inventory corruption:** stock that doesn't match its movement history, negative stock, or stock changes nobody made | Health check `INTEGRITY` alert (`negative_stock`, `stock_movement_mismatch`); owner reports | Stop sales in the app; compare with the stock history; Backup Owner checks the last good backup |
| **S3** | **Repeated duplicate financial transactions:** the same sale recorded twice, more than once | Health check `duplicate_purchases`; owner reports double sales | Pause; Technical Support checks the idempotency receipts. Don't delete the rows until they are understood. |
| **S4** | **Unrecoverable data loss:** recorded data gone that can't be restored | Missing sales or customers, confirmed against backups | Backup Owner restores into an isolated database for comparison (`docs/BACKUP_AND_RECOVERY.md` §5); never restore over production blindly |
| **S5** | **Backups failing with no replacement protection:** no successful database backup for **48 h**, or restore verification fails | Health check `BACKUP` alerts on 2 consecutive days; `verify-backup.sh` not ok | Pause new data entry beyond the pharmacy's normal trading, and fix the backups before anything else |
| **S6** | **Authentication bypass:** someone gets in without valid credentials, a suspended user keeps working, or staff reach owner-only functions | User report; the audit log shows actions by suspended users | Suspend; rotate the affected accounts; Technical Support investigates |
| **S7** | **Persistent inability to operate:** the pharmacy can't record sales in the app (online **or** offline) for more than **1 trading day**, or keeps losing work | Support reports; M1 shows no sales on a trading day | Switch to the previous method; P0 investigation |
| **S8** | **A regulatory or legal concern** raised by the pharmacy, a regulator or counsel about the data held | A formal notice | Pause; involve the owner and legal |

**Resuming requires:**
- the root cause is understood;
- a fix or mitigation is verified;
- affected data is reconciled with the owner;
- the decision is written in the incident log.

## These usually do not require stopping

Log them, prioritise them, and give a workaround:

| Issue | Handling |
|---|---|
| Cosmetic UI issues: layout, wording, colours | P3; weekly review |
| Minor report formatting, or a chart that is hard to read | P3 |
| An optional workflow is inconvenient (walk-in workaround, no product edit, no credit repayments) | P3 / feedback; known limits |
| A single "Needs attention" item that is explained and resolved | P2 at most |
| A short offline period that syncs correctly afterwards | Working as designed |
| One staff member can't sign in, while others can | P1/P2; the owner suspends if needed |
| Supplier price or purchase-order convenience issues | P2/P3 |
| Email-based password reset unavailable (SMTP open) | Known limitation; P1 only if it blocks the owner |

**When in doubt:** if **data correctness, security or the ability to trade** is in question,
treat it as a stop condition until proven otherwise.
