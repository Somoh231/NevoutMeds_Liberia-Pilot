import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchDocuments } from "@/platform/data/documents";
import { SEED_DOCS } from "@/platform/seed/documents";

export function useDocuments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["documents", user?.pharmacyId],
    enabled: !!user,
    queryFn: async () => {
      if (!user?.pharmacyId) return SEED_DOCS;
      return fetchDocuments({ pharmacyId: user.pharmacyId });
    }
  });
}

