import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { captureException } from "@/platform/observability/monitoring";

// Unexpected API failures are reported for diagnosis; expected ones (offline,
// permission, validation, conflicts) are filtered by the monitoring SDK.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error, query) => captureException(error, { area: "query", key: String(query.queryKey?.[0] ?? "") }) }),
  mutationCache: new MutationCache({ onError: (error, _v, _c, mutation) => captureException(error, { area: "mutation", key: String(mutation.options.mutationKey?.[0] ?? "") }) }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
      // NevOut Meds does its own offline handling: queries fall back to the
      // device's cached snapshot. Without "always", TanStack Query would pause
      // them while the browser reports no connection and the pharmacy would see
      // an empty screen instead of its data.
      networkMode: "always"
    },
    mutations: {
      retry: 0,
      // Likewise for writes: a paused mutation never reaches the durable queue,
      // so offline work would silently hang instead of being saved locally.
      networkMode: "always"
    }
  }
});
