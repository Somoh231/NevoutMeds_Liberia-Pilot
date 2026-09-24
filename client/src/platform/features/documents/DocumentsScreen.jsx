import { useEffect, useRef, useState } from "react";
import { DOC_CATEGORIES } from "@/platform/seed/documents";
import { daysUntil, fmtBytes, fmtDate } from "@/platform/utils/documents";
import { buildDocumentExportText, buildDocumentsIndexCsv } from "@/platform/features/documents/exports";
import { useDocuments } from "@/platform/data/useDocuments";
import { useCreateDocument } from "@/platform/data/useCreateDocument";
import { getSignedDownloadUrl } from "@/platform/data/documents";
import { Alert, Badge, Button, Chip, Dialog, EmptyState, FilterBar, FormField, IconButton, Input, PageHeader, SearchInput, Select, Textarea } from "@/platform/ui";
import {
  CircleCheck,
  CloudUpload,
  Download,
  Eye,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Receipt,
  ShieldCheck,
  Truck,
  Upload,
  Users
} from "@/platform/ui/icons";

// One restrained icon per category, from the app's single icon set.
const CATEGORY_ICON = { registration: ShieldCheck, audit: CircleCheck, supplier: Truck, financial: Receipt, staff: Users, other: FolderOpen };
const categoryOf = (id) => DOC_CATEGORIES.find((c) => c.id === id);

// The file type comes from the name the owner gave it; unknown types stay generic.
function fileKind(name) {
  const ext = (String(name).match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();
  if (ext === "pdf") return { ext: "PDF", Icon: FileText, tone: "pdf" };
  if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)) return { ext: ext === "jpeg" ? "JPG" : ext.toUpperCase(), Icon: FileImage, tone: "image" };
  if (["xlsx", "xls", "csv"].includes(ext)) return { ext: ext.toUpperCase(), Icon: FileSpreadsheet, tone: "sheet" };
  if (["doc", "docx", "txt"].includes(ext)) return { ext: ext.toUpperCase(), Icon: FileText, tone: "doc" };
  return { ext: ext ? ext.toUpperCase() : "FILE", Icon: File, tone: "other" };
}

function expiryState(expiryDate) {
  const d = daysUntil(expiryDate);
  if (d === null) return { tone: "neutral", label: "No expiry", d };
  if (d <= 0) return { tone: "danger", label: "Expired", d };
  if (d <= 30) return { tone: "warning", label: `Expires in ${d} day${d === 1 ? "" : "s"}`, d };
  if (d <= 60) return { tone: "warning", label: `Expires ${fmtDate(expiryDate)}`, d };
  return { tone: "success", label: `Valid to ${fmtDate(expiryDate)}`, d };
}

const EMPTY_UPLOAD = { name: "", category: "registration", note: "", tags: "", expiryDate: "", file: null };

export default function DocumentsScreen({ onShowToast }) {
  const docsQ = useDocuments();
  const createM = useCreateDocument();
  // Real workspaces start empty and fill from Supabase (Phase 3).
  const [docs, setDocs] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [uploadModal, setUploadModal] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD);
  const fileRef = useRef(null);

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

  const pickFile = (f) => { if (f) setUploadForm((p) => ({ ...p, name: p.name || f.name, file: f })); };
  const openUpload = () => { setUploadForm(EMPTY_UPLOAD); setUploadModal(true); };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setUploadForm({ ...EMPTY_UPLOAD, name: files[0].name, file: files[0] });
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
      setUploadForm(EMPTY_UPLOAD);
    } catch (e) {
      onShowToast(e?.message || "Upload failed — nothing was saved", "error");
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
      // No stored file: export the record's details as text.
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

  const countOf = (id) => (id === "all" ? docs.length : docs.filter((d) => d.category === id).length);
  const selectedKind = uploadForm.file ? fileKind(uploadForm.file.name) : null;

  return (
    <div className="nv-page nv-docs-page">
      <PageHeader
        title="Documents"
        description={
          <>
            {docs.length} document{docs.length === 1 ? "" : "s"} · private to your pharmacy
            {docsQ.isFetching && <span> · Syncing…</span>}
            {docsQ.error && <span> · Showing saved copy</span>}
          </>
        }
        actions={
          <>
            <Button icon={<Download size={18} aria-hidden="true" />} onClick={exportIndex} disabled={docs.length === 0}>Export index</Button>
            <Button variant="primary" icon={<Upload size={18} aria-hidden="true" />} onClick={openUpload}>Upload document</Button>
          </>
        }
      />

      {(expired.length > 0 || expiringSoon.length > 0) && (
        <div className="nv-stack nv-docs__alerts">
          {expired.length > 0 && (
            <Alert tone="danger" title={`${expired.length} document${expired.length > 1 ? "s have" : " has"} expired`}>
              {expired.map((d) => d.name.replace(/\.[a-z0-9]{1,5}$/i, "")).join(", ")}. Renew and upload the new copy.
            </Alert>
          )}
          {expiringSoon.length > 0 && (
            <Alert tone="warning" title={`${expiringSoon.length} document${expiringSoon.length > 1 ? "s expire" : " expires"} within 60 days`}>
              {expiringSoon.map((d) => `${d.name.replace(/\.[a-z0-9]{1,5}$/i, "")} (${daysUntil(d.expiryDate)} days)`).join(", ")}
            </Alert>
          )}
        </div>
      )}

      <FilterBar search={<SearchInput label="Search documents" placeholder="Name, tag or note" value={search} onChange={(e) => setSearch(e.target.value)} />}>
        <Chip pressed={activeCategory === "all"} onClick={() => setActiveCategory("all")}>
          All <span className="nv-num" aria-label={`, ${countOf("all")} documents`}>{countOf("all")}</span>
        </Chip>
        {DOC_CATEGORIES.map((c) => (
          <Chip key={c.id} pressed={activeCategory === c.id} onClick={() => setActiveCategory(c.id)}>
            {c.label} <span className="nv-num" aria-label={`, ${countOf(c.id)} documents`}>{countOf(c.id)}</span>
          </Chip>
        ))}
      </FilterBar>

      <div
        className={`nv-docs__drop${dragOver ? " is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dragOver && <p className="nv-docs__dropnote" aria-hidden="true"><CloudUpload size={20} /> Drop to upload</p>}
        {filtered.length === 0 ? (
          docs.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={26} />}
              title="No documents yet"
              actions={<Button variant="primary" icon={<Upload size={18} aria-hidden="true" />} onClick={openUpload}>Upload your first document</Button>}
            >
              Keep licences, supplier agreements and registrations in one place, with their expiry dates, so an inspection never catches you out.
            </EmptyState>
          ) : (
            <EmptyState icon={<FolderOpen size={26} />} title="No documents match" actions={<Button onClick={() => { setSearch(""); setActiveCategory("all"); }}>Clear filters</Button>}>
              Try another name or tag, or show every category.
            </EmptyState>
          )
        ) : (
          <ul className="nv-docs" aria-label="Documents">
            {filtered.map((doc) => {
              const kind = fileKind(doc.name);
              const cat = categoryOf(doc.category);
              const CatIcon = CATEGORY_ICON[doc.category] ?? FolderOpen;
              const exp = expiryState(doc.expiryDate);
              return (
                <li key={doc.id} className="nv-doc">
                  <span className={`nv-doc__type nv-doc__type--${kind.tone}`} aria-hidden="true">
                    <kind.Icon size={20} />
                    <small>{kind.ext}</small>
                  </span>
                  <div className="nv-doc__main">
                    <p className="nv-doc__name">{doc.name}</p>
                    <p className="nv-doc__meta">
                      <span className="nv-doc__cat"><CatIcon size={14} aria-hidden="true" /> {cat?.label ?? "Other"}</span>
                      <span>{fmtBytes(doc.size)}</span>
                      <span>Added {fmtDate(doc.uploadedAt)}</span>
                    </p>
                    {doc.note && <p className="nv-doc__note">{doc.note}</p>}
                    {doc.tags.length > 0 && (
                      <ul className="nv-doc__tags" aria-label="Tags">
                        {doc.tags.map((t, j) => <li key={j}>{t}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="nv-doc__expiry"><Badge tone={exp.tone}>{exp.label}</Badge></div>
                  <div className="nv-doc__actions">
                    <IconButton label={`View details of ${doc.name}`} outline onClick={() => setViewDoc(doc)}><Eye size={18} aria-hidden="true" /></IconButton>
                    <IconButton label={`Download ${doc.name}`} outline onClick={() => downloadDoc(doc)}><Download size={18} aria-hidden="true" /></IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={uploadModal}
        onClose={() => setUploadModal(false)}
        title="Upload a document"
        description="Stored privately for your pharmacy. Only your team can open it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setUploadModal(false)}>Cancel</Button>
            <Button variant="primary" loading={createM.isPending} disabled={!uploadForm.name || !uploadForm.category} onClick={commitUpload}>Upload document</Button>
          </>
        }
      >
        <div className="nv-stack">
          <button type="button" className={`nv-dropzone${uploadForm.file ? " has-file" : ""}`} onClick={() => fileRef.current?.click()}>
            {uploadForm.file ? (
              <>
                <span className={`nv-doc__type nv-doc__type--${selectedKind.tone}`} aria-hidden="true"><selectedKind.Icon size={20} /><small>{selectedKind.ext}</small></span>
                <span className="nv-dropzone__text">
                  <b>{uploadForm.file.name}</b>
                  <small>{fmtBytes(uploadForm.file.size)} · choose a different file</small>
                </span>
              </>
            ) : (
              <>
                <CloudUpload size={26} aria-hidden="true" />
                <span className="nv-dropzone__text">
                  <b>Choose a file</b>
                  <small>PDF, JPG, PNG, WEBP, Word (.docx) or Excel (.xlsx), up to 25 MB</small>
                </span>
              </>
            )}
          </button>
          <input ref={fileRef} type="file" hidden aria-hidden="true" tabIndex={-1} onChange={(e) => pickFile(e.target.files?.[0])} />

          <FormField label="Document name">
            <Input value={uploadForm.name} onChange={(e) => setUploadForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Pharmacy licence 2026.pdf" />
          </FormField>
          <div className="nv-docs__pair">
            <FormField label="Category">
              <Select value={uploadForm.category} onChange={(e) => setUploadForm((p) => ({ ...p, category: e.target.value }))}>
                {DOC_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Expiry date" hint="Leave empty if it doesn’t expire">
              <Input type="date" value={uploadForm.expiryDate} onChange={(e) => setUploadForm((p) => ({ ...p, expiryDate: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Tags" hint="Separate with commas">
            <Input value={uploadForm.tags} onChange={(e) => setUploadForm((p) => ({ ...p, tags: e.target.value }))} placeholder="e.g. LMHRA, licence, 2026" />
          </FormField>
          <FormField label="Note">
            <Textarea rows={2} value={uploadForm.note} onChange={(e) => setUploadForm((p) => ({ ...p, note: e.target.value }))} placeholder="Anything the team should know about this document" />
          </FormField>
        </div>
      </Dialog>

      <Dialog
        open={!!viewDoc}
        onClose={() => setViewDoc(null)}
        width={520}
        title={viewDoc?.name ?? "Document"}
        description={viewDoc ? categoryOf(viewDoc.category)?.label : undefined}
        footer={viewDoc && (
          <>
            <Button variant="ghost" onClick={() => setViewDoc(null)}>Close</Button>
            <Button variant="primary" icon={<Download size={18} aria-hidden="true" />} onClick={() => { downloadDoc(viewDoc); setViewDoc(null); }}>Download</Button>
          </>
        )}
      >
        {viewDoc && (() => {
          const exp = expiryState(viewDoc.expiryDate);
          return (
            <div className="nv-stack">
              {exp.d !== null && exp.d <= 60 && (
                <Alert tone={exp.d <= 0 ? "danger" : "warning"}>
                  {exp.d <= 0 ? "This document has expired. Renew it and upload the new copy." : `This document expires in ${exp.d} days. Plan the renewal now.`}
                </Alert>
              )}
              <div className="nv-statement">
                <dl>
                  <div className="nv-statement__row"><dt>Expiry</dt><dd><Badge tone={exp.tone}>{exp.label}</Badge></dd></div>
                  <div className="nv-statement__row"><dt>Added</dt><dd>{fmtDate(viewDoc.uploadedAt)}</dd></div>
                  <div className="nv-statement__row"><dt>File</dt><dd>{fileKind(viewDoc.name).ext} · {fmtBytes(viewDoc.size)}</dd></div>
                </dl>
              </div>
              {viewDoc.tags.length > 0 && <ul className="nv-doc__tags" aria-label="Tags">{viewDoc.tags.map((t, i) => <li key={i}>{t}</li>)}</ul>}
              {viewDoc.note && <p className="nv-doc__viewnote">{viewDoc.note}</p>}
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
}
