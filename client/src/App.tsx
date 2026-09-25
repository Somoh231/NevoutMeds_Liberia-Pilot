import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import PlatformPage from "./pages/PlatformPage";
import ProtectedRoute from "@/platform/auth/ProtectedRoute";
import { Suspense, lazy, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import { trackEvent } from "@/platform/reliability/telemetry";
import LoadingScreen from "@/platform/reliability/LoadingScreen";
import DemoModeBadge from "@/components/DemoModeBadge";

// First paint only needs the sign-in page and the workspace shell. Everything
// else is its own chunk (precached by the service worker, so it still opens
// offline) to keep the initial download small on 3G.
const HomePage = lazy(() => import("./pages/HomePage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
const ForgotPasswordPage = lazy(() => import("./pages/PasswordResetPages").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/PasswordResetPages").then((m) => ({ default: m.ResetPasswordPage })));
const ImportPage = lazy(() => import("./pages/ImportPage"));
const AdminConsolePage = lazy(() => import("./pages/AdminConsolePage"));

export default function App() {
  const loc = useLocation();
  const { user, security } = useAuth();

  useEffect(() => {
    // Only a verified session can write pharmacy data (two-step verification, Phase 11).
    if (!user?.pharmacyId || !security.satisfied) return;
    void trackEvent({
      pharmacyId: user.pharmacyId,
      userId: String(user.id),
      eventName: "route_view",
      path: loc.pathname,
      module: null,
      metadata: {}
    });
  }, [loc.pathname, user?.pharmacyId, user?.id, security.satisfied]);

  return (
    <>
      <DemoModeBadge />
      <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/import"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingScreen label="Loading import tools…" />}>
                <ImportPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingScreen label="Loading admin console…" />}>
                <AdminConsolePage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/platform"
          element={
            <ProtectedRoute>
              <PlatformPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}

