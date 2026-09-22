import type { DocumentRow, UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export const DOCUMENTS_BUCKET = "documents";

export type UiDocument = {
  id: string;
  name: string;
  category: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  expiryDate: string | null;
  status: "active" | "archived";
  note: string;
  tags: string[];
  storagePath: string | null;
};

export async function fetchDocuments(args: { pharmacyId: UUID }): Promise<UiDocument[]> {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("documents")
    .select("id,name,category,size,uploaded_at,uploaded_by,expiry_date,status,note,tags,storage_path")
    .eq("pharmacy_id", args.pharmacyId)
    .order("uploaded_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  return (data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    size: Number(d.size ?? 0),
    uploadedAt: d.uploaded_at,
    uploadedBy: d.uploaded_by ?? "—",
    expiryDate: d.expiry_date ?? null,
    status: d.status,
    note: d.note ?? "",
    tags: d.tags ?? [],
    storagePath: d.storage_path ?? null
  }));
}

export async function uploadDocumentFile(args: { pharmacyId: UUID; file: File }): Promise<{ storagePath: string; size: number }> {
  const db = getSupabaseDb();
  const path = `${args.pharmacyId}/${crypto.randomUUID()}-${args.file.name}`;
  const { error } = await db.storage.from(DOCUMENTS_BUCKET).upload(path, args.file, {
    upsert: false,
    contentType: args.file.type || "application/octet-stream"
  });
  if (error) throw error;
  return { storagePath: path, size: args.file.size };
}

export async function createDocumentMetadata(args: {
  pharmacyId: UUID;
  uploadedBy: UUID;
  name: string;
  category: string;
  size: number;
  expiryDate: string | null;
  note: string;
  tags: string[];
  storagePath: string | null;
}): Promise<DocumentRow> {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("documents")
    .insert({
      pharmacy_id: args.pharmacyId,
      name: args.name,
      category: args.category,
      size: args.size,
      uploaded_by: args.uploadedBy,
      expiry_date: args.expiryDate,
      status: "active",
      note: args.note,
      tags: args.tags,
      storage_path: args.storagePath
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as DocumentRow;
}

export async function getSignedDownloadUrl(args: { storagePath: string; expiresInSeconds?: number }) {
  const db = getSupabaseDb();
  const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUrl(args.storagePath, args.expiresInSeconds ?? 60);
  if (error) throw error;
  return data.signedUrl;
}


export async function deleteDocumentFile(storagePath: string): Promise<void> {
  const db = getSupabaseDb();
  const { error } = await db.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
  if (error) throw error;
}

/**
 * Upload + metadata as one recoverable unit. If the metadata insert fails the
 * uploaded object is removed again, so a failed upload cannot leave an orphaned
 * file in storage (Phase 3 finding).
 */
export async function createDocumentWithFile(args: {
  pharmacyId: UUID;
  uploadedBy: UUID;
  file: File | null;
  name: string;
  category: string;
  expiryDate: string | null;
  note: string;
  tags: string[];
}): Promise<DocumentRow> {
  let storagePath: string | null = null;
  let size = 0;

  if (args.file) {
    const uploaded = await uploadDocumentFile({ pharmacyId: args.pharmacyId, file: args.file });
    storagePath = uploaded.storagePath;
    size = uploaded.size;
  }

  try {
    return await createDocumentMetadata({
      pharmacyId: args.pharmacyId,
      uploadedBy: args.uploadedBy,
      name: args.name,
      category: args.category,
      size,
      expiryDate: args.expiryDate,
      note: args.note,
      tags: args.tags,
      storagePath
    });
  } catch (err) {
    if (storagePath) {
      // Best-effort compensation; report the original failure either way.
      try {
        await deleteDocumentFile(storagePath);
      } catch {
        throw new Error(
          `Saving the document failed and the uploaded file could not be removed automatically (${storagePath}). Please retry.`
        );
      }
    }
    throw err;
  }
}
