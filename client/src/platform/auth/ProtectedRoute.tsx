import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/platform/auth/AuthProvider";
import LoadingScreen from "@/platform/reliability/LoadingScreen";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, user, configured } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen label="Loading your workspace…" />;
  // Demo Mode: if Supabase is not configured, allow access (seed data only).
  if (!configured) return <>{children}</>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user.pharmacyId && location.pathname.startsWith("/platform")) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

