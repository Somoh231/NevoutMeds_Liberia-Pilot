# Country readiness matrix

Legend:
- ✅ built and tested
- 🧪 built; synthetic tests only (no real pharmacy has used it)
- ⚠️ built with a known limit
- ❓ not verified (see the [research backlog](REGULATORY_RESEARCH_BACKLOG.md))
- — not applicable

"Ready" here is **software readiness**. No country other than Liberia has had a real pilot, and
no row makes a regulatory claim.

## Software capability

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
| ⚠️ One operating currency per pharmacy | LR (USD + LRD tills) | Mixed-currency sales need an exchange rate. A decision is needed first; see the architecture report. |
| ⚠️ UI language is English only | RW (fr/rw), KE (sw) | Locale changes number and date *format* only. Nothing is translated. |
| ⚠️ Phone rules check shape, not network allocation | all | No phone library (bundle budget). A valid-looking unassigned number is accepted. |
| ⚠️ The admin console is in UTC | all | Deliberate: it is a cross-tenant view. |

## Regulatory readiness

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
