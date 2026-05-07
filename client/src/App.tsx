import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import PlatformPage from "./pages/PlatformPage";
import OnboardingPage from "./pages/OnboardingPage";
import ProtectedRoute from "@/platform/auth/ProtectedRoute";
import { Suspense, lazy, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import { trackEvent } from "@/platform/reliability/telemetry";
import LoadingScreen from "@/platform/reliability/LoadingScreen";
import DemoModeBadge from "@/components/DemoModeBadge";

const ImportPage = lazy(() => import("./pages/ImportPage"));
const AdminConsolePage = lazy(() => import("./pages/AdminConsolePage"));

export default function App() {
  const loc = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.pharmacyId) return;
    void trackEvent({
      pharmacyId: user.pharmacyId,
      userId: String(user.id),
      eventName: "route_view",
      path: loc.pathname,
      module: null,
      metadata: {}
    });
  }, [loc.pathname, user?.pharmacyId, user?.id]);

  return (
    <>
      <DemoModeBadge />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
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
    </>
  );
}

