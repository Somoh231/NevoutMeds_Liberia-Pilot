import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "@/platform/design/tokens/tokens.css";
import "@/platform/ui/ui.css";
import { AuthProvider, useAuth } from "@/platform/auth/AuthProvider";
import { CountryProvider } from "@/platform/country/CountryProvider";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/platform/data/queryClient";
import { ErrorBoundary } from "@/platform/reliability/ErrorBoundary";
import { SyncProvider } from "@/platform/offline/SyncProvider";
import { logError, logErrorToDb } from "@/platform/reliability/logging";
import { registerSW } from "virtual:pwa-register";

// Safe update flow:
// - when a new version is available, prompt before activating it
// - avoids mid-session reloads while staff are in critical workflows
registerSW({
  immediate: true,
  onNeedRefresh() {
    const ok = window.confirm("A new version of NevOut Meds is available. Update now?");
    if (ok) window.location.reload();
  },
  onOfflineReady() {
    // App is cached for offline use; no UI changes required.
  }
});

/** Publishes the signed-in pharmacy's country configuration (currency, timezone, locale). */
function TenantCountry({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <CountryProvider config={user?.country}>{children}</CountryProvider>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary
          onError={(err, info) => {
            logError(err, info);
            void logErrorToDb({ message: err instanceof Error ? err.message : "Unknown error", context: info });
          }}
        >
          <AuthProvider>
            <TenantCountry>
              <SyncProvider>
                <App />
              </SyncProvider>
            </TenantCountry>
          </AuthProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);

