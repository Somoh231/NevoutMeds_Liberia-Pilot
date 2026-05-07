import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { createDocumentMetadata, uploadDocumentFile } from "@/platform/data/documents";

export function useCreateDocument() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: { file: File | null; name: string; category: string; note: string; tags: string[]; expiryDate: string | null }) => {
      if (!user?.pharmacyId) throw new Error("Missing pharmacy_id");
      const uploadedBy = String(user.id);
      let storagePath: string | null = null;
      let size = 0;
      if (args.file) {
        const res = await uploadDocumentFile({ pharmacyId: user.pharmacyId, file: args.file });
        storagePath = res.storagePath;
        size = res.size;
      }
      await createDocumentMetadata({
        pharmacyId: user.pharmacyId,
        uploadedBy,
        name: args.name,
        category: args.category,
        size,
        expiryDate: args.expiryDate,
        note: args.note,
        tags: args.tags,
        storagePath
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["documents", user?.pharmacyId] });
    }
  });
}

