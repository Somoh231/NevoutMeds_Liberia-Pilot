# Offline architecture

Pharmacies keep working without a connection. Their work is saved on the device and reaches the
server **exactly once** when the connection returns. The server stays the authority for
everything: stock, prices, permissions and currency.

## Layers

| Layer | What | Where |
|---|---|---|
| App shell | The service worker (Workbox, `vite-plugin-pwa`) precaches the built app. Navigation is network-first with a 3 s timeout, then the cached shell. Scripts and styles are stale-while-revalidate; images are cache-first. | `vite.config.ts` |
| Data snapshots | IndexedDB `nevoutmeds` → `cache` store. Snapshots are **per tenant** (`<pharmacy>:<user>`) for products, inventory, customers, purchases, reminders, suppliers, supplier catalogue, purchase orders, dashboard and context. `fetchWithCache` serves the snapshot whenever the network fails. | `platform/offline/cache.ts`, `cachedQuery.ts` |
| Who am I | `meta` store: the last server-confirmed profile, including the pharmacy's **country configuration** (currency, timezone, locale, payment methods). A suspended account can't continue offline. | `platform/offline/session.ts` |
| Write queue | `queue` store: durable mutations with an idempotency key, status, retry count and a human-readable summary | `platform/offline/queue.ts` |
| Sync engine | Drains the queue oldest-first when online (on reconnect, on focus, after enqueue, and on backoff timers) | `platform/offline/sync.ts` |

## Queued mutations

`record_purchase`, `adjust_stock`, `create_customer`, `create_reminder`, `create_product` and
`create_purchase_order`. Each goes through its `*_idempotent` RPC. The server records a receipt
per idempotency key (`mutation_receipts`), so a replay returns the first result instead of
writing twice.

## Status model

```
pending ──send──► syncing ──ok──► synced (pruned)
                     │
                     ├─ network / 5xx / serialization ─► failed ─(backoff: 5 s·2^n, max 10 min)─► syncing
                     ├─ permanent rejection (RLS, validation, stock, currency 409) ─► conflict ("Needs attention")
                     └─ app closed or crashed mid-request ─► stays "syncing" ─(next session)─► resent
```

- **Order matters.** The engine stops at the first retryable failure, so a sale queued before a
  stock adjustment is applied first.
- **Conflicts** are never discarded automatically or silently retried. Each one shows the
  server's reason in the sync panel. The person removes it only after dealing with it: **I've
  dealt with this — remove it**, a two-step confirmation, only for `conflict` items, logged as
  `app_events.sync_conflict_dismissed`. Signing out with unsynced work asks first. And
  since 0019 the device also reports `sync_conflict` to `app_logs` for operators.
- **Crash recovery.** Each page session stamps the entries it is sending (`syncing_session`). An
  entry left `syncing` by a session that no longer exists is resent by the next one. The
  idempotency key makes that safe even if the first request did reach the server. This was
  fixed 2026-09-23 after a production test found stranded entries, and is covered by
  `ui_recovery` check 3.7.
- **Currency.** A queued sale carries the currency it was priced in (`p_currency`). If the
  pharmacy's currency changed before it synced, the server answers **409** and the sale becomes a
  conflict, never a re-labelled amount.

## What works offline

| Works offline | Needs a connection |
|---|---|
| Record sales (stock checked locally, then authoritatively on sync) | Staff invitations, suspensions, role changes |
| Stock adjustments, new customers, reminders, new products | Settings (country, currency, payment methods) |
| Purchase orders | Recording supplier prices, adding suppliers |
| Viewing cached stock, customers, suppliers, orders, dashboard | Financial summary, reports calculated on the server |
| Business dates and money formatting (country config is cached) | Document uploads |

## Tests

| Suite | Checks |
|---|---|
| `ui_offline_first` | 21: offline sale, adjustment, customer, reminder, close/reopen, sync exactly once |
| `ui_offline_sale_stock` | 25: offline at 360 px, reconnect sync, stock agreement |
| `ui_recovery` | 26 locally, 22 against hosted (the Realtime-outage section needs the local stack): long gaps, suspension while queued, crash during sync, stranded entry |
| `api_realtime_offline` | 24–25: idempotent replays, realtime propagation |
| `40_offline_idempotency.test.sql` | Receipts, replay, concurrency, optimistic versions |
| `ui_country_pilots` S1–S2 | An offline sale keeps its currency and syncs once |
