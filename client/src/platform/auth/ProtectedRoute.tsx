import { Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy, type ReactNode } from "react";
import { DEMO_MODE, useAuth } from "@/platform/auth/AuthProvider";
import SupabaseNotConfiguredScreen from "@/platform/auth/SupabaseNotConfiguredScreen";
import LoadingScreen from "@/platform/reliability/LoadingScreen";

// Only people who still owe a second step download this screen.
const MfaGate = lazy(() => import("@/platform/auth/MfaGate"));

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, user, configured, security, mfaSetupShowing } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen label="Loading your workspace…" />;
  // Unconfigured build: only an explicit demo build may bypass auth.
  if (!configured) {
    if (DEMO_MODE) return <>{children}</>;
    return <SupabaseNotConfiguredScreen />;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user.pharmacyId && location.pathname.startsWith("/platform")) return <Navigate to="/onboarding" replace />;
  // Two-step verification (Phase 11): the workspace opens only once the session
  // is strong enough for this account. The database enforces the same rule.
  if (security.status !== "ready") return <LoadingScreen label="Checking your sign-in…" />;
  if (!security.satisfied || mfaSetupShowing) {
    return (
      <Suspense fallback={<LoadingScreen label="Checking your sign-in…" />}>
        <MfaGate />
      </Suspense>
    );
  }
  return <>{children}</>;
}
