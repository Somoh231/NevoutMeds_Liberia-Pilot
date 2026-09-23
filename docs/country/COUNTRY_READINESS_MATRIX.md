# Country readiness matrix

This matrix keeps two kinds of readiness strictly apart.

| | Meaning |
|---|---|
| **TECHNICAL ARCHITECTURE READY** | The software can be configured for the country, and it is enforced and tested (server registry, currency, timezone, phone, address, payments, isolation). |
| **REGULATORY / MARKET ENTRY READY** | The legal, tax, licensing, data-protection and commercial questions for operating there have been researched, verified and resolved. |

**No country except Liberia is market-entry ready.** Supporting a country technically is not a
claim that NevOut Meds is ready, allowed or compliant to operate there. Liberia itself is ready
only for the scope of a **small, controlled pilot**. See
[FINAL_PILOT_READINESS_REPORT.md](../../FINAL_PILOT_READINESS_REPORT.md).

## Summary

| Country | Technical architecture | Regulatory / market entry |
|---|---|---|
| 🇱🇷 Liberia | **READY**: live pilot configuration; verified on the production backend (0018) | **Controlled pilot only.** Items in the research backlog remain open (tax on medicines, receipts, licensing, data protection). |
| 🇬🇭 Ghana | **READY**: synthetic pilot passed locally and on the production backend | **NOT READY**: research required |
| 🇰🇪 Kenya | **READY**: synthetic pilot incl. the UTC-midnight test passed locally and on the production backend | **NOT READY**: research required |
| 🇷🇼 Rwanda | **READY**: synthetic pilot (0-decimal currency, offline) passed locally and on the production backend | **NOT READY**: research required; UI is English-only |
| 🇳🇬 Nigeria | **READY (SQL- and unit-tested)**, no UI pilot | **NOT READY**: research required |
| 🇸🇱 Sierra Leone | **READY (seeded, unit-tested)**, no UI pilot | **NOT READY**: research required |
| 🇬🇲 The Gambia | **READY (seeded, unit-tested)**, no UI pilot | **NOT READY**: research required |

Legend for the detail tables:
- ✅ built and tested
- 🧪 built; synthetic tests only (no real pharmacy has used it)
- ⚠️ built with a known limit
- ❓ not verified (see the [research backlog](REGULATORY_RESEARCH_BACKLOG.md))
- — not applicable

## Technical architecture: capability detail

| Capability | 🇱🇷 LR | 🇸🇱 SL | 🇬🇭 GH | 🇳🇬 NG | 🇬🇲 GM | 🇰🇪 KE | 🇷🇼 RW |
|---|---|---|---|---|---|---|---|
| Country registry row (server) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Client profile = server registry (parity test) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Seed profile (synthetic demo pharmacy) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Country-first onboarding | ✅ | 🧪 | 🧪 | 🧪 | 🧪 | 🧪 | 🧪 |
| Operating currency and symbol | ✅ US$ / L$ | 🧪 Le | ✅ GH₵ | 🧪 ₦ | 🧪 D | ✅ KSh | ✅ FRw |
| Minor units (display + input) | ✅ 2 | 🧪 2 | ✅ 2 | 🧪 2 | 🧪 2 | ✅ 2 | ✅ 0 |
| Sale stamped with currency (server) | ✅ | 🧪 | ✅ | ✅ (SQL) | 🧪 | ✅ | ✅ |
| Mismatched-currency sale → conflict | ✅ | 🧪 | ✅ | 🧪 | 🧪 | 🧪 | 🧪 |
| Offline sale keeps its currency | ✅ | 🧪 | 🧪 | 🧪 | 🧪 | 🧪 | ✅ |
| Business day in pharmacy timezone | ✅ (UTC+0, unchanged) | 🧪 | 🧪 | 🧪 | 🧪 | ✅ midnight | ✅ midnight |
| Device timezone ignored | ✅ | 🧪 | 🧪 | 🧪 | 🧪 | ✅ (device = New York) | 🧪 |
| Phone parse, E.164 storage, display | ✅ | ✅ unit | ✅ e2e | ✅ unit | ✅ unit | ✅ unit | ✅ unit |
| Address labels (stable keys) | ✅ County | 🧪 District | ✅ Region | 🧪 State | 🧪 Region | 🧪 County | 🧪 Province |
| Payment methods (defaults) | ✅ same 5 | 🧪 | ✅ | ✅ Card / Bank (SQL) | 🧪 | 🧪 | 🧪 |
| Price Compare never mixes currencies | ✅ | 🧪 | ✅ GHS + USD | 🧪 | 🧪 | 🧪 | 🧪 |
| Reports segmented by currency | ✅ | 🧪 | ✅ | 🧪 | 🧪 | 🧪 | 🧪 |
| Tenant isolation across countries | ✅ | ✅ (SQL) | ✅ | ✅ (SQL) | — | ✅ (SQL) | ✅ (SQL) |
| Country/currency locked after first sale | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Known limits

| Limit | Affects | Notes |
|---|---|---|
| ⚠️ One operating currency per pharmacy | LR (USD + LRD tills) | A single sale mixing USD and L$ is not supported. See [MIXED_CURRENCY_DESIGN_NOTE.md](MIXED_CURRENCY_DESIGN_NOTE.md). |
| ⚠️ UI language is English only | RW (fr/rw), KE (sw) | The app stays English-first for the pilot. Locale-aware numbers and dates exist; translated UI strings do not, and there is no i18n string infrastructure. Future i18n is a separate product decision. |
| ⚠️ Phone rules check shape, not network allocation | all | No phone library (bundle budget). A valid-looking unassigned number is accepted. |
| ⚠️ The admin console is in UTC | all | Deliberate: it is a cross-tenant view. |

## Regulatory / market-entry readiness

| Item | 🇱🇷 | 🇸🇱 | 🇬🇭 | 🇳🇬 | 🇬🇲 | 🇰🇪 | 🇷🇼 |
|---|---|---|---|---|---|---|---|
| VAT / sales tax on medicines | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |
| Fiscal receipt / e-invoicing | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |
| Premises licence rules | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |
| Pharmacist-in-charge rules | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |
| Prescription / controlled-drug rules | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |
| Health-data protection and residency | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |
| Insurance scheme claims | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |

**No country should go live with real pharmacies outside Liberia** until the ❓ rows that apply
to its launch scope are resolved through the research backlog.
