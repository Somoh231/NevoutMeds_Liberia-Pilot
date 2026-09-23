# NevOut Meds: owner training guide

What each part of NevOut Meds is **for**, and how to use it day to day. Allow about 45 minutes
with your NevOut Meds trainer. Staff have a shorter guide: [STAFF_QUICK_START.md](STAFF_QUICK_START.md).

**The menu:**
- **Operations** (everyone): Dashboard, Sales, Inventory, Expiry, Customers, Reminders;
- **Procurement** (everyone): Suppliers;
- **Insights** (owner): Financials, Analyst, Reports;
- **Management** (owner): Staff, Documents, Import data, Settings.

On a phone, the bottom bar holds Dashboard, Sales, Inventory, Customers and **More**.

## 1. Dashboard: your morning briefing

**For:** what needs your attention today.

- **Needs attention** lists things to act on: low stock, products expiring soon, refill reminders
  due, customers over their credit limit, cheaper supplier prices, and products with no reorder
  level. Each item has a button that takes you straight to the fix.
- **Today so far:** sales today, money in stock, customer credit outstanding.
- **Daily WhatsApp summary:** opens WhatsApp with today's summary. You choose who receives it;
  nothing is sent automatically.

**Habit:** open the Dashboard at opening time and clear the "Needs attention" list.

## 2. Inventory

**For:** knowing what is on the shelf, and keeping that number true.

- Each product shows stock, days of stock left, reorder level, expiry and status (Out of stock,
  Critical, Low, Overstock, …). Use **Needs attention first** to see problems on top.
- **Adjust stock:** enter the **change**, not the new total: `+24` for a delivery, `−3` for
  damage. Choose a reason:
  - **Delivery received**;
  - **Damaged or expired**;
  - **Returned by customer**;
  - **Stock count correction**.
  Every change is kept in the product's **Stock history**.
- **Add product** for a single new item: name, category and selling price are required. Set a
  **reorder level** too, or the app can't warn you before it runs out.
- **Changing a price or reorder level later:** there is no edit button yet. Your NevOut Meds
  operator (or you, in Import data) re-imports the changed rows ([DATA_IMPORT_GUIDE.md](DATA_IMPORT_GUIDE.md)).

## 3. Recording sales

**For:** every sale, so stock and money stay true.

**Sales → New sale:**
1. choose the **customer** (use **Walk-in Customer** for people you don't register);
2. add products (search by name);
3. choose the **payment method**;
4. press **Record sale**.

- The app stops a sale if there isn't enough stock, and shows the customer's **recorded
  allergies** when you choose them.
- **Credit:** adds the amount to the customer's balance and warns you about their limit.
  **Repayments can't be recorded in the app yet**, so keep your credit book for repayments, and
  **never sell on Credit to Walk-in Customer**.
- "**Sale recorded · Synced**" means it is saved in the cloud. "**Saved on this device · Pending
  sync**" means you are offline and it will be sent automatically (see §15).

## 4. Customers

**For:** knowing your regular customers, their allergies, their credit and their refills.

- Only **name and phone** are required. Allergies, conditions, date of birth and notes are
  optional: record them only if the customer agrees. **Don't write diagnoses in notes.**
- Each customer card shows purchase history, total spent, visits, credit and refill reminders,
  and has a **New sale** shortcut.
- Phone numbers are stored in the international form (+231…). One phone number = one customer.

## 5. Reminders

**For:** bringing regular patients back before their medicine runs out.

- **New reminder:** choose the customer, the medicine and the refill date.
- The list groups them as Overdue, Due today, Upcoming and Reminded. Open WhatsApp from a reminder
  to message the customer, then **Mark as reminded** (this needs a connection).

## 6. Price Compare

**For:** buying at the best price.

- **Suppliers → Price compare:** choose a product and a quantity. Suppliers are ranked by the
  unit price you recorded; out-of-stock suppliers and delivery costs are shown where you recorded
  them.
- It only helps if you **record prices** from at least 2 suppliers for the same product.
  **Only the latest price** per supplier is kept.
- If prices are in different currencies (L$ and US$), they are shown side by side and **never
  converted**.

## 7. Suppliers

**For:** a single contact list for everyone you buy from.

- **Add supplier:** name, WhatsApp or phone, town, lead time, payment terms. **Record a price**
  whenever a supplier quotes one.
- Adding suppliers and recording prices need a connection.

## 8. Purchase orders

**For:** ordering clearly, with a record of what you ordered.

- Create an order from **Price compare**, or from **Reorder** on a product in Inventory. The app
  builds the WhatsApp message; press **Open WhatsApp** to send it yourself.
- **When the goods arrive:** the order does **not** add stock automatically. Go to Inventory →
  **Adjust stock** → **Delivery received** for each product.

## 9. Expiry alerts

**For:** selling or removing stock before it expires.

- Groups: Expired, Urgent (within 7 days), Within 30 days, 30–60 days, 60–90 days. Each shows the
  **value at risk** and a recommendation ("Remove from sale now", "Dispense first; don't reorder
  yet").
- **Write off** expired stock (this records a "Damaged or expired" adjustment).
- The app keeps **one expiry date per product**, so record the earliest one.

## 10. Analyst

**For:** findings from your own records, ranked by what needs action first.

Each finding shows why it matters, the evidence, the recommended action and its estimated effect.
It uses only your data: it invents nothing and does not use AI from outside. With little data
(the first days) it will say "Nothing needs action".

## 11. Reports

**For:** looking back over 7, 30 or 90 days.

Reports: Sales, Products & margin, Inventory, Expiry, Purchases, Suppliers, Customers & credit.
**Export CSV** opens in any spreadsheet. Margin uses each product's **current** cost. Reports are
calculated on the server, so they need a connection.

## 12. Cash flow / Financials

**For:** what came in, what it cost, and where your money is tied up.

- **Shown:** revenue, cost of goods, gross profit, sales by payment method, credit outstanding,
  stock at cost, slow or excess stock, open orders and reorders due.
- **Not tracked, and deliberately left blank rather than guessed:** cash on hand, operating
  expenses, payroll, and what you owe suppliers.

## 13. Staff management

See [STAFF_ONBOARDING_GUIDE.md](STAFF_ONBOARDING_GUIDE.md).
- **Invite:** by email, then send the link by WhatsApp.
- **Suspend:** stops access immediately, even on a lost phone.
- **Offboard:** when someone leaves.
- **Team activity log:** a permanent record of these changes.

## 14. Settings

**For:** your pharmacy's details and how money works.

- **General / Contact:** name, phone, WhatsApp, address. Suppliers see the name on your orders.
- **Money:**
  - **country and currency are locked after your first sale**;
  - **payment methods** at the till: keep only the ones you take.
- **Registration:** optional numbers for your own records. The app doesn't check them or send
  them anywhere.
- Settings need a connection.

## 15. Offline mode

**For:** keeping the counter working when the internet drops.

- **You can:**
  - record sales;
  - adjust stock;
  - add customers, products and reminders;
  - create purchase orders;
  - look at stock, customers, suppliers and the dashboard.
- **You need a connection for:**
  - inviting or suspending staff;
  - Settings;
  - adding suppliers and recording prices;
  - Reports and Financials;
  - Documents;
  - stock history;
  - marking a reminder as sent.
- **Before you rely on offline mode, open the app once while connected on each device.**

Practice with [OFFLINE_TRAINING.md](OFFLINE_TRAINING.md).

## 16. Sync status

The pill at the top right always tells you where your work is:

| You see | It means | Do |
|---|---|---|
| **Synced** | Everything on this device is saved in the cloud | Nothing |
| **Offline** | No connection; your work is saved **on this device** | Keep working |
| **Waiting to sync · N** | N changes are saved here, not yet in the cloud | Connect; they send automatically |
| **Syncing…** | Sending now | Wait a moment |
| **Sync failed** | Couldn't send yet; it retries automatically | Check the connection, or open the pill and press **Try syncing now** |
| **Needs attention** | The server refused a change | See §17 |

**Waiting to sync is not the same as saved in the cloud.** If that phone is lost before it syncs,
that work is lost with it. If you try to **sign out** while work is waiting, the app warns you
first: stay signed in until it says **Synced**.

## 17. Resolving "Needs attention"

This happens rarely. It means the server refused a change that was made on this device, usually
while offline. Examples:
- not enough stock for an offline sale (someone else sold the last units);
- the account was suspended;
- the currency changed.

1. Tap the **Needs attention** pill. Each refused change shows **the reason**.
2. Decide what's right. For example: check the shelf, then record the sale again with the correct
   quantity, or adjust stock first.
3. Once you've dealt with it, press **I've dealt with this — remove it** → **Remove**. This removes
   it from this device only; it was never saved on the server.
4. If you don't understand the reason, **don't remove it**. Send a screenshot to support.

## 18. Getting help

- **In the app:** the account menu (your initials, top right) → **Help & feedback**. There you
  can **Report issue**, **Request feature** or give a **Quick rating**, and find the
  **WhatsApp support** and **Email support** buttons.
- **What to send:** [SUPPORT_ISSUE_TEMPLATE.md](SUPPORT_ISSUE_TEMPLATE.md). Include a screenshot
  and what the sync pill says. **Never send your password.**
- **Urgent** (you can't sell, or you see another pharmacy's data): WhatsApp support straight away.
