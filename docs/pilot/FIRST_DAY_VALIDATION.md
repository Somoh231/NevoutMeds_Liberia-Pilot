# First-day validation

Run this with the owner (and one staff member) **before** declaring the pharmacy live. Record
the result of each test. **All tests must pass**; any failure is handled under
[PILOT_SUPPORT_MODEL.md](PILOT_SUPPORT_MODEL.md) before go-live.

**Test data rules:**
- use the `TRAINING ITEM` product and **Walk-in Customer** (see
  [OFFLINE_TRAINING.md](OFFLINE_TRAINING.md));
- create **one** test customer named `Test Validation` with the **pharmacy's own phone**
  **only if** Walk-in Customer doesn't exist yet (otherwise skip it; each phone number can only
  be used once);
- **no real patient data** is used for testing.

Pharmacy: ______ · Date: ______ · Operator: ______ · Owner: ______

| # | Test | How | Expected | ✓ |
|---|---|---|---|---|
| 1 | **Owner login** | Owner signs out, then in, on their device | Dashboard; pharmacy name correct | ☐ |
| 2 | **Staff login** | A staff member signs in on their own device | Dashboard; same pharmacy name; **no** Financials, Reports, Staff or Settings in the menu | ☐ |
| 3 | **Correct pharmacy identity** | Operator: `node ops/provision/check-account.mjs --email <owner>` | owner / active; LR; agreed currency; `Africa/Monrovia`; members list correct | ☐ |
| 4 | **Correct inventory** | Pick 5 products from the reconciliation sheet | Stock, price and expiry match the signed-off opening count | ☐ |
| 5 | **Search** | Inventory search for a product by part of its name; Customers search by phone | Found in both | ☐ |
| 6 | **Sale** | Sales → New sale → Walk-in Customer → `TRAINING ITEM` × 2 → Cash | "Sale recorded · Synced"; stock −2; the sale is in Latest sales today | ☐ |
| 7 | **Inventory adjustment** | `TRAINING ITEM` → Adjust stock `+2`, "Stock count correction" | Stock back; the entry is in Stock history with the user's name | ☐ |
| 8 | **Customer creation** | Staff member registers `Test Validation` (only if allowed above) | Appears in Customers with a +231 phone | ☐ |
| 9 | **Reminder** | Reminders → New reminder → Walk-in Customer → `TRAINING ITEM` → tomorrow | Listed under Upcoming | ☐ |
| 10 | **Supplier comparison** | Suppliers → Price compare → a product with 2+ supplier prices, qty 10 | Suppliers ranked by unit price, with the order total | ☐ |
| 11 | **Purchase order** | From Price compare → create an order for `TRAINING ITEM` × 1 (don't send the WhatsApp) | The order appears under the supplier's Open orders | ☐ |
| 12 | **Expiry view** | Expiry | Products group by expiry window; nothing is shown as expired unless it really is | ☐ |
| 13 | **Report** | Owner: Reports → Sales → 7 days → Export CSV | The test sales are listed; the CSV opens | ☐ |
| 14 | **Offline sale** | Staff device: airplane mode → sale of `TRAINING ITEM` × 1 | "Saved on this device · Pending sync"; pill "Offline" / 1 waiting | ☐ |
| 15 | **Reconnect** | Airplane mode off | Pill → Syncing… → Synced | ☐ |
| 16 | **Sync** | Owner device: Sales | The offline sale is shown **once**; stock is the same on both devices | ☐ |
| 17 | **Logout / login** | Staff: account menu → Sign out (pill Synced) → sign in again | Signs out with no warning; signs back in to the same pharmacy | ☐ |
| 18 | **Help** | Account menu → Help & feedback → **WhatsApp support** | WhatsApp opens with the support contact and pre-filled text | ☐ |
| 19 | **Health** | Operator: `node ops/monitor/health-check.mjs` | HEALTHY; `sync failures 0`, `conflicts 0` | ☐ |

**After validation:**
- [ ] Put `TRAINING ITEM` stock back to its starting value (Adjust stock, "Stock count correction").
- [ ] Cancel or leave the test purchase order unsent, and tell the owner it is a test.
- [ ] Mark the test reminder as reminded (or leave it; it only concerns Walk-in Customer).
- [ ] Tell the owner the training sales (0.01 each) will appear in their Sales history.

Result: ☐ **All passed. Proceed to go-live approval** · ☐ Failed: items ____ → issue raised
______
