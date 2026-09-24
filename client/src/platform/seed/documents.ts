// Icons live in the screen (Lucide), not here: emoji render inconsistently on
// older Android phones and are read aloud by screen readers.
export const DOC_CATEGORIES = [
  { id: "registration", label: "Business registration", desc: "Licences, permits, regulatory filings" },
  { id: "audit", label: "Audit and compliance", desc: "Audit trails, inspection reports, compliance documents" },
  { id: "supplier", label: "Supplier agreements", desc: "Contracts, invoices, delivery notes" },
  { id: "financial", label: "Financial records", desc: "Tax filings, bank statements, receipts" },
  { id: "staff", label: "Staff documents", desc: "Employment contracts, certifications" },
  { id: "other", label: "Other", desc: "Miscellaneous documents" }
];

export const SEED_DOCS = [
  { id: 1, name: "Pharmacy Operating License 2025.pdf", category: "registration", size: 245000, uploadedAt: "2026-01-15", uploadedBy: "John Kamara", expiryDate: "2026-12-31", status: "active", note: "Annual renewal due Dec 31", tags: ["license", "LMHRA"] },
  { id: 2, name: "Business Registration Certificate.pdf", category: "registration", size: 180000, uploadedAt: "2025-09-10", uploadedBy: "John Kamara", expiryDate: "2027-09-09", status: "active", note: "", tags: ["registration", "MCI"] },
  { id: 3, name: "Q1 2026 Audit Report.pdf", category: "audit", size: 512000, uploadedAt: "2026-04-05", uploadedBy: "John Kamara", expiryDate: null, status: "active", note: "Clean audit — no findings", tags: ["audit", "Q1-2026"] },
  { id: 4, name: "MedSupply West Africa Contract.pdf", category: "supplier", size: 320000, uploadedAt: "2025-11-01", uploadedBy: "John Kamara", expiryDate: "2026-10-31", status: "active", note: "Auto-renew unless cancelled 30 days prior", tags: ["MedSupply", "contract"] },
  { id: 5, name: "PharmaCorp Supply Agreement.pdf", category: "supplier", size: 290000, uploadedAt: "2025-11-15", uploadedBy: "John Kamara", expiryDate: "2026-11-14", status: "active", note: "", tags: ["PharmaCorp", "contract"] },
  { id: 6, name: "April 2026 Purchase Invoices.pdf", category: "financial", size: 156000, uploadedAt: "2026-04-22", uploadedBy: "John Kamara", expiryDate: null, status: "active", note: "", tags: ["invoices", "April-2026"] },
  { id: 7, name: "2025 Annual Tax Filing.pdf", category: "financial", size: 420000, uploadedAt: "2026-03-15", uploadedBy: "John Kamara", expiryDate: null, status: "active", note: "Filed with LRA on March 15", tags: ["tax", "2025"] },
  { id: 8, name: "Fatu Williams — Employment Contract.pdf", category: "staff", size: 125000, uploadedAt: "2024-06-15", uploadedBy: "John Kamara", expiryDate: null, status: "active", note: "", tags: ["staff", "employment"] },
  { id: 9, name: "LMHRA Inspection Report Jan 2026.pdf", category: "audit", size: 380000, uploadedAt: "2026-01-28", uploadedBy: "John Kamara", expiryDate: null, status: "active", note: "Passed. Minor recommendations noted.", tags: ["LMHRA", "inspection"] },
  { id: 10, name: "Cold Chain Compliance Certificate.pdf", category: "registration", size: 210000, uploadedAt: "2025-12-01", uploadedBy: "John Kamara", expiryDate: "2026-11-30", status: "active", note: "", tags: ["cold-chain", "compliance"] }
];

