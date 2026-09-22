import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { DEMO_MODE, useAuth } from "@/platform/auth/AuthProvider";
import SupabaseNotConfiguredScreen from "@/platform/auth/SupabaseNotConfiguredScreen";
import LoadingScreen from "@/platform/reliability/LoadingScreen";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, user, configured } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen label="Loading your workspace…" />;
  // Unconfigured build: only an explicit demo build may bypass auth.
  if (!configured) {
    if (DEMO_MODE) return <>{children}</>;
    return <SupabaseNotConfiguredScreen />;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user.pharmacyId && location.pathname.startsWith("/platform")) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

