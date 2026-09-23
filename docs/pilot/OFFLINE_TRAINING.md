# Offline training exercise

About 15 minutes per device. Do it **on every device the pharmacy will use**, with the person who
will use it.

**Two messages to remember:**

> **OFFLINE does not mean LOST.** Work done offline is saved on the device and sent automatically
> when the connection returns, exactly once.
>
> **"Waiting to sync" is not "saved in the cloud".** Until the pill says **Synced**, that work
> exists only on that device. If the device is lost, broken or wiped first, the work is lost
> with it.

## Before you start (operator)

- **Use a TEST product.** Before go-live, the owner adds a product named `TRAINING ITEM`
  (category `Training`, price `0.01`, stock `10`) in Inventory → Add product. Sales of it don't
  distort real stock.
- Use **Walk-in Customer** for the test sale.
- At the end, write the training stock back (step 10). The training sales remain in the
  sales history as 0.01 sales: tell the owner, so they aren't surprised by them in Reports.

## The exercise

| # | Do | You should see |
|---|---|---|
| 1 | **Sign in while online** | The Dashboard with the pharmacy name; the pill says **Synced** |
| 2 | **Confirm data loaded:** open Inventory, Customers and Sales once | The product list and customers appear. This saves them on the device for offline use. |
| 3 | **Disconnect:** turn off Wi-Fi **and** mobile data (or use airplane mode) | A banner, **You're offline. Keep working…**; the pill says **Offline** |
| 4 | **Record a sale:** Sales → New sale → Walk-in Customer → `TRAINING ITEM` × 1 → Cash → Record sale | "**Saved on this device · Pending sync**" |
| 5 | **Show where it is:** tap the pill | "Waiting to sync"; the list shows the sale as **waiting**. Inventory shows `TRAINING ITEM` at 9, because the device already counts it. |
| 6 | **Close the app completely** (swipe it away), then reopen it, still offline | The app opens without internet; the pill still counts **1** waiting. Nothing was lost. |
| 7 | **Reconnect:** turn the data back on | The banner disappears; the pill shows **Syncing…** |
| 8 | **Watch it sync** (a few seconds) | The pill says **Synced** |
| 9 | **Verify:** on **another device** signed into the same pharmacy (the owner's phone), open Sales | The training sale is there once, **not twice**, and `TRAINING ITEM` stock is 9 there too |
| 10 | **Clean up:** Inventory → `TRAINING ITEM` → Adjust stock `+1`, reason **Stock count correction** (then type ` – offline training` after it in the note box) | Stock is back to 10 |

## Talking points

- **Do** open the app online every morning, so the device has fresh stock and customer lists.
- **Do** get connected at least once during the day if you worked offline. Mobile data for a
  minute is enough.
- **Don't** sign out, clear browser data or uninstall the app while work is waiting. The app
  warns you at sign-out.
- **Two devices offline at once** can both sell the last unit. When both sync, the server accepts
  the first. The second becomes **Needs attention** ("Not enough stock"), and the owner resolves
  it. The server never lets stock go below zero.
- **Needs a connection:** inviting or suspending staff, Settings, adding suppliers and recording
  prices, Reports, Financials, Documents, stock history, and marking a reminder as sent.

## Sign-off

| Device | User | Steps 1–10 passed | Trainer |
|---|---|---|---|
| | | ☐ | |
| | | ☐ | |
