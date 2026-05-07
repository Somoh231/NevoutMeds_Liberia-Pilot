import { useEffect, useRef, useState } from "react";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { DOC_CATEGORIES, SEED_DOCS } from "@/platform/seed/documents";
import { daysUntil, fmtBytes, fmtDate } from "@/platform/utils/documents";
import { buildDocumentExportText, buildDocumentsIndexCsv } from "@/platform/features/documents/exports";
import { Modal } from "@/platform/components/primitives";
import { useDocuments } from "@/platform/data/useDocuments";
import { useCreateDocument } from "@/platform/data/useCreateDocument";
import { getSignedDownloadUrl } from "@/platform/data/documents";

export default function DocumentsScreen({ onShowToast }) {
  const docsQ = useDocuments();
  const createM = useCreateDocument();
  const [docs, setDocs] = useState(SEED_DOCS);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [uploadModal, setUploadModal] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: "", category: "registration", note: "", tags: "", expiryDate: "", file: null });
  const fileRef = useRef(null);

  // Keep UI behavior intact: hydrate local list from query when available.
  useEffect(() => {
    if (docsQ.data && Array.isArray(docsQ.data)) setDocs(docsQ.data);
  }, [docsQ.data]);

  const filtered = docs.filter((d) => {
    const q = search.toLowerCase();
    const matchCat = activeCategory === "all" || d.category === activeCategory;
    const matchSearch = !q || d.name.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)) || d.note.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const expiringSoon = docs.filter((d) => d.expiryDate && daysUntil(d.expiryDate) !== null && daysUntil(d.expiryDate) <= 60 && daysUntil(d.expiryDate) > 0);
  const expired = docs.filter((d) => d.expiryDate && daysUntil(d.expiryDate) !== null && daysUntil(d.expiryDate) <= 0);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setUploadForm((p) => ({ ...p, name: files[0].name, file: files[0] }));
      setUploadModal(true);
    }
  };

  const commitUpload = async () => {
    if (!uploadForm.name || !uploadForm.category) return;
    try {
      await createM.mutateAsync({
        file: uploadForm.file,
        name: uploadForm.name,
        category: uploadForm.category,
        note: uploadForm.note,
        tags: uploadForm.tags ? uploadForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        expiryDate: uploadForm.expiryDate || null
      });
      onShowToast(`${uploadForm.name} uploaded successfully`, "success");
      setUploadModal(false);
      setUploadForm({ name: "", category: "registration", note: "", tags: "", expiryDate: "", file: null });
    } catch (e) {
      onShowToast("Upload failed — please try again", "info");
    }
  };

  const downloadDoc = async (doc) => {
    try {
      if (doc.storagePath) {
        const signed = await getSignedDownloadUrl({ storagePath: doc.storagePath, expiresInSeconds: 60 });
        const a = document.createElement("a");
        a.href = signed;
        a.download = doc.name;
        a.click();
        onShowToast(`Downloading ${doc.name}`, "success");
        return;
      }
      // Fallback: export metadata text (keeps UX intact if file not yet stored)
      const content = buildDocumentExportText(doc, DOC_CATEGORIES);
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      a.click();
      URL.revokeObjectURL(url);
      onShowToast(`Downloading ${doc.name}`, "success");
    } catch (e) {
      onShowToast("Download failed — please try again", "info");
    }
  };

  const exportIndex = () => {
    const csv = buildDocumentsIndexCsv(docs, DOC_CATEGORIES, fmtBytes);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nevoutmeds_documents.csv";
    a.click();
    URL.revokeObjectURL(url);
    onShowToast("Document index exported as CSV", "success");
  };

  const FileIcon = ({ category }) => {
    const cat = DOC_CATEGORIES.find((c) => c.id === category);
    return (
      <div style={{ width: 40, height: 40, borderRadius: 10, background: cat?.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
        {cat?.icon}
      </div>
    );
  };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto", fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Document Center</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span>{docs.length} documents · Audit-ready · Always accessible</span>
            {docsQ.isFetching && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>Syncing…</span>}
            {docsQ.error && <span style={{ fontSize: 12, color: "#f97316", fontWeight: 800 }}>Using cached data</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportIndex} style={{ padding: "9px 16px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
            ⬇ Export Index
          </button>
          <button onClick={() => setUploadModal(true)} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
            ⬆ Upload Document
          </button>
        </div>
      </div>

      {/* Expiry warnings */}
      {(expiringSoon.length > 0 || expired.length > 0) && (
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {expired.length > 0 && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 16 }}>🚨</span>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#7f1d1d" }}>
                {expired.length} document{expired.length > 1 ? "s" : ""} expired: {expired.map((d) => d.name.split(".")[0]).join(", ")}
              </div>
              <button onClick={() => setActiveCategory("registration")} style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                Review
              </button>
            </div>
          )}
          {expiringSoon.length > 0 && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#78350f" }}>
                {expiringSoon.length} document{expiringSoon.length > 1 ? "s" : ""} expiring soon: {expiringSoon.map((d) => `${d.name.split(".")[0]} (${daysUntil(d.expiryDate)}d)`).join(", ")}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10, marginBottom: 22 }}>
        <button onClick={() => setActiveCategory("all")} style={{ padding: "14px 12px", borderRadius: 12, border: `1.5px solid ${activeCategory === "all" ? GREEN : "#e2e8f0"}`, background: activeCategory === "all" ? "#f0fdf4" : "#fff", cursor: "pointer", fontFamily: FONT, textAlign: "left", transition: "all 0.15s" }}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>📁</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: activeCategory === "all" ? "#047857" : SLATE }}>All Documents</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{docs.length} files</div>
        </button>
        {DOC_CATEGORIES.map((cat) => {
          const count = docs.filter((d) => d.category === cat.id).length;
          const active = activeCategory === cat.id;
          return (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{ padding: "14px 12px", borderRadius: 12, border: `1.5px solid ${active ? cat.color : "#e2e8f0"}`, background: active ? cat.bg : "#fff", cursor: "pointer", fontFamily: FONT, textAlign: "left", transition: "all 0.15s" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{cat.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: active ? cat.color : SLATE }}>{cat.label}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                {count} file{count !== 1 ? "s" : ""}
              </div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} width="13" height="13" fill="none" stroke="#334155" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents, tags…" style={{ width: "100%", padding: "10px 12px 10px 32px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box", background: "#fff" }} />
      </div>

      {/* Drop zone + document list */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{ border: `2px dashed ${dragOver ? GREEN : "#e2e8f0"}`, borderRadius: 14, background: dragOver ? "#f0fdf4" : "transparent", padding: dragOver ? "20px" : "0", marginBottom: dragOver ? "16px" : "0", transition: "all 0.2s", textAlign: "center" }}
      >
        {dragOver && <div style={{ fontSize: 13, fontWeight: 700, color: "#047857", padding: "8px" }}>Drop to upload</div>}
      </div>

      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "2.5fr 1fr 0.8fr 0.8fr auto", gap: 8, fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", alignItems: "center" }}>
          <span>Document</span>
          <span>Category</span>
          <span>Size / Date</span>
          <span>Expiry</span>
          <span>Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#334155" }}>No documents found</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Upload your first document or adjust the filter</div>
          </div>
        ) : (
          filtered.map((doc, i) => {
            const expDays = daysUntil(doc.expiryDate);
            const expColor = expDays !== null ? (expDays <= 0 ? "#ef4444" : expDays <= 30 ? "#f59e0b" : expDays <= 60 ? "#f97316" : "#10b981") : "#94a3b8";
            return (
              <div
                key={doc.id}
                style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr 0.8fr 0.8fr auto", gap: 8, padding: "14px 20px", borderBottom: "1px solid #f8fafc", alignItems: "center", animation: `fadeUp 0.3s ${i * 0.03}s both` }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <FileIcon category={doc.category} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: SLATE, lineHeight: 1.3 }}>{doc.name}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                      {doc.tags.map((t, j) => (
                        <span key={j} style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "#f1f5f9", color: "#64748b" }}>
                          {t}
                        </span>
                      ))}
                    </div>
                    {doc.note && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>📝 {doc.note}</div>}
                  </div>
                </div>
                <div>
                  {(() => {
                    const cat = DOC_CATEGORIES.find((c) => c.id === doc.category);
                    return (
                      <span style={{ padding: "3px 9px", borderRadius: 99, background: cat?.bg, color: cat?.color, fontSize: 11, fontWeight: 700 }}>
                        {cat?.icon} {cat?.label}
                      </span>
                    );
                  })()}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{fmtBytes(doc.size)}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmtDate(doc.uploadedAt)}</div>
                </div>
                <div>
                  {doc.expiryDate ? (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: expColor }}>{expDays <= 0 ? "EXPIRED" : expDays <= 30 ? `${expDays}d left` : fmtDate(doc.expiryDate)}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>Expiry</div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: "#cbd5e1" }}>No expiry</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setViewDoc(doc)} style={{ width: 30, height: 30, borderRadius: 7, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }} title="View">
                    👁
                  </button>
                  <button onClick={() => downloadDoc(doc)} style={{ width: 30, height: 30, borderRadius: 7, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }} title="Download">
                    ⬇
                  </button>
                  <button onClick={() => { setDocs((prev) => prev.filter((d) => d.id !== doc.id)); onShowToast("Document deleted", "info"); }} style={{ width: 30, height: 30, borderRadius: 7, border: "1.5px solid #fecaca", background: "#fef2f2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#ef4444" }} title="Delete">
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Upload Modal */}
      <Modal open={uploadModal} onClose={() => setUploadModal(false)}>
        <div style={{ fontSize: 17, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Upload Document</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>Stored securely · Accessible anytime · Audit-ready</div>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{ border: "2px dashed #e2e8f0", borderRadius: 12, padding: "28px", textAlign: "center", cursor: "pointer", marginBottom: 18, background: "#f8fafc", transition: "all 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = GREEN)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Click to select or drag & drop</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>PDF, JPG, PNG, DOC, XLSX — max 10MB</div>
          <input
            ref={fileRef}
            type="file"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files[0]) setUploadForm((p) => ({ ...p, name: e.target.files[0].name, file: e.target.files[0] }));
            }}
          />
        </div>

        {uploadForm.name && <div style={{ background: "#f0fdf4", borderRadius: 9, padding: "10px 14px", marginBottom: 14, border: "1px solid #bbf7d0", fontSize: 13, fontWeight: 600, color: "#065f46" }}>✓ {uploadForm.name}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>File Name (or rename)</label>
            <input value={uploadForm.name} onChange={(e) => setUploadForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Pharmacy License 2026.pdf" style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Category</label>
            <select value={uploadForm.category} onChange={(e) => setUploadForm((p) => ({ ...p, category: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", background: "#fff" }}>
              {DOC_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Expiry Date (if any)</label>
            <input type="date" value={uploadForm.expiryDate} onChange={(e) => setUploadForm((p) => ({ ...p, expiryDate: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Tags (comma separated)</label>
            <input value={uploadForm.tags} onChange={(e) => setUploadForm((p) => ({ ...p, tags: e.target.value }))} placeholder="e.g. LMHRA, license, 2026" style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Note</label>
            <textarea value={uploadForm.note} onChange={(e) => setUploadForm((p) => ({ ...p, note: e.target.value }))} placeholder="Any important notes about this document…" style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", resize: "none", height: 56, boxSizing: "border-box" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setUploadModal(false)} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Cancel
          </button>
          <button onClick={commitUpload} style={{ flex: 2, padding: "11px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Upload Document
          </button>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} maxW={520}>
        {viewDoc &&
          (() => {
            const cat = DOC_CATEGORIES.find((c) => c.id === viewDoc.category);
            const expDays = daysUntil(viewDoc.expiryDate);
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: cat?.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{cat?.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: SLATE, lineHeight: 1.3 }}>{viewDoc.name}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{cat?.label}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
                  {[["Uploaded", fmtDate(viewDoc.uploadedAt)], ["Uploaded By", viewDoc.uploadedBy], ["File Size", fmtBytes(viewDoc.size)], ["Expiry", viewDoc.expiryDate ? fmtDate(viewDoc.expiryDate) : "No expiry"]].map(([l, v], i) => (
                    <div key={i} style={{ background: "#f8fafc", borderRadius: 9, padding: "12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: expDays !== null && l === "Expiry" ? (expDays <= 0 ? "#ef4444" : expDays <= 30 ? "#f59e0b" : "#334155") : "#334155" }}>{v}</div>
                    </div>
                  ))}
                </div>
                {viewDoc.tags.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>{viewDoc.tags.map((t, i) => <span key={i} style={{ padding: "4px 10px", borderRadius: 99, background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 700 }}>{t}</span>)}</div>}
                {viewDoc.note && <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 13, color: "#78350f" }}>📝 {viewDoc.note}</div>}
                {expDays !== null && expDays <= 60 && (
                  <div style={{ background: expDays <= 0 ? "#fef2f2" : "#fffbeb", border: `1px solid ${expDays <= 0 ? "#fecaca" : "#fde68a"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 13, fontWeight: 600, color: expDays <= 0 ? "#dc2626" : "#b45309" }}>
                    {expDays <= 0 ? "⚠ This document has expired. Please renew and re-upload." : `⚠ This document expires in ${expDays} days. Schedule renewal now.`}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setViewDoc(null)} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                    Close
                  </button>
                  <button onClick={() => { downloadDoc(viewDoc); setViewDoc(null); }} style={{ flex: 2, padding: "11px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    ⬇ Download
                  </button>
                </div>
              </>
            );
          })()}
      </Modal>
    </div>
  );
}

