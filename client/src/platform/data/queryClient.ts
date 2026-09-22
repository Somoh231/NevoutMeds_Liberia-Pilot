import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
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
