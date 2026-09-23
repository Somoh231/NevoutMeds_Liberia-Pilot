# Regulatory research backlog

Phase 9 deliberately did **no legal or regulatory research**. Nothing below is built, enforced,
pre-filled or claimed in the product. Each item needs verified local sources, ideally reviewed by
someone licensed in that country, before any behaviour depends on it.

**Status key:**
- **KNOWN**: we are confident the *concept* exists and store it only as a free-text field for the
  owner's own reference.
- **RESEARCH_REQUIRED**: anything about format, authority, obligation or rate.

## Cross-country

| # | Topic | Why it matters | Current product behaviour | Status |
|---|---|---|---|---|
| X1 | VAT / sales-tax treatment of medicines (zero-rated, exempt, standard) | Receipts, reported revenue | **No tax calculated or shown.** Settings says so. | RESEARCH_REQUIRED |
| X2 | Receipt / invoice legal requirements (fiscal devices, e-invoicing, mandatory fields) | Some countries require certified receipts | No receipts are issued as legal documents | RESEARCH_REQUIRED |
| X3 | Premises licence: issuing authority, number format, renewal cycle | Compliance reminders | Optional free-text field, flagged "Rules not yet verified" | RESEARCH_REQUIRED |
| X4 | Pharmacist-in-charge requirements | Staffing rules | Optional free-text field, flagged | RESEARCH_REQUIRED |
| X5 | Prescription-only medicine lists and dispensing rules | Sale restrictions | Pharmacy-set `requires_prescription` flag only; no enforcement | RESEARCH_REQUIRED |
| X6 | Controlled substances registers | Record-keeping duties | Not supported | RESEARCH_REQUIRED |
| X7 | Record-retention periods for sales and patient data | Data lifecycle | Data is kept indefinitely | RESEARCH_REQUIRED |
| X8 | Health-data / personal-data protection law (consent, cross-border transfer, data residency) | Customer records, hosting region | Minimum data collected. Hosting region unchanged. | RESEARCH_REQUIRED |
| X9 | Insurance / health-scheme claims (NHIS, SHA, CBHI, NHIA, …) | "Insurance" payment method | Recorded label only: "no claim is sent" | RESEARCH_REQUIRED |
| X10 | Mobile-money reconciliation / regulatory reporting | Payment records | Method label only; no provider integration | RESEARCH_REQUIRED |
| X11 | Price controls on essential medicines | Pricing | None | RESEARCH_REQUIRED |
| X12 | Business registration and tax identifiers (formats) | Settings fields | Free text, never validated | KNOWN (concept) / RESEARCH_REQUIRED (format) |

## Per country

| Country | Items to verify first |
|---|---|
| **Liberia** | X1 (GST/VAT on medicines), X3 (premises licensing authority and format), X5, X9. How dual USD/LRD pricing is presented on receipts. |
| **Sierra Leone** | X1, X2, X3, X5. The redenominated leone (SLE) on receipts versus legacy SLL references. |
| **Ghana** | X1 (VAT/levies), X2 (e-VAT / fiscal receipts), X3, X4, X9 (national health insurance claims). |
| **Nigeria** | X1, X2, X3, X4, X5, X6. Whether card and bank-transfer defaults match pharmacy practice. |
| **The Gambia** | X1, X3, X5. |
| **Kenya** | X1, X2 (electronic tax invoicing), X3, X4, X9. The KRA PIN is stored as free text only. |
| **Rwanda** | X1, X2 (electronic billing machines), X3, X9 (community health insurance). The language requirements for receipts (rw/fr/en). |

## Rules for moving an item out of this backlog

1. Cite a primary source (the statute, a regulator notice or official guidance) with its date.
2. Have a locally licensed reviewer confirm it.
3. Model it as configuration, never as a branch in a screen.
4. Ship it behind the country's profile, with a test.
5. Update [COUNTRY_READINESS_MATRIX.md](COUNTRY_READINESS_MATRIX.md).
