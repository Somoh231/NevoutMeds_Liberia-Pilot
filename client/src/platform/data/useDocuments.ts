import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchDocuments } from "@/platform/data/documents";

export function useDocuments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["documents", user?.pharmacyId],
    enabled: !!user,
    queryFn: async () => {
      // No tenant yet (pre-onboarding): show nothing rather than sample data.
      if (!user?.pharmacyId) return [];
      return fetchDocuments({ pharmacyId: user.pharmacyId });
    }
  });
}

