import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { createDocumentWithFile } from "@/platform/data/documents";

export function useCreateDocument() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: { file: File | null; name: string; category: string; note: string; tags: string[]; expiryDate: string | null }) => {
      if (!user?.pharmacyId) throw new Error("Missing pharmacy_id");
      await createDocumentWithFile({
        pharmacyId: user.pharmacyId,
        uploadedBy: String(user.id),
        file: args.file,
        name: args.name,
        category: args.category,
        expiryDate: args.expiryDate,
        note: args.note,
        tags: args.tags
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["documents", user?.pharmacyId] });
    }
  });
}

