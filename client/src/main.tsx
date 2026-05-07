import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import { AuthProvider } from "@/platform/auth/AuthProvider";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/platform/data/queryClient";
import { ErrorBoundary } from "@/platform/reliability/ErrorBoundary";
import { logError, logErrorToDb } from "@/platform/reliability/logging";

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
            <App />
          </AuthProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);

