import type { DocumentRecord } from "@/platform/domain";
import { fmtDate } from "@/platform/utils/documents";
import { toCsv } from "@/platform/utils/csv";

export function buildDocumentExportText(doc: DocumentRecord, categories: any[]) {
  return `NEVOUTMEDS — Document details (no file stored)

Name: ${doc.name}
Category: ${categories.find((c) => c.id === doc.category)?.label}
Uploaded: ${fmtDate(doc.uploadedAt)}
Uploaded by: ${doc.uploadedBy}
${doc.expiryDate ? `Expiry: ${fmtDate(doc.expiryDate)}` : ""}
${doc.note ? `Note: ${doc.note}` : ""}
Tags: ${doc.tags.join(", ")}

No file is stored for this record. This text lists its details only; it is not a copy of the document.`;
}

export function buildDocumentsIndexCsv(docs: any[], categories: any[], fmtBytes: (n: number) => string) {
  const headers = ["Name", "Category", "Size", "Uploaded", "Expiry", "Tags", "Note"];
  const rows = docs.map((d) => [
    d.name,
    categories.find((c) => c.id === d.category)?.label,
    fmtBytes(d.size),
    fmtDate(d.uploadedAt),
    fmtDate(d.expiryDate),
    d.tags.join(";"),
    d.note
  ]);
  return toCsv([headers, ...rows]);
}

