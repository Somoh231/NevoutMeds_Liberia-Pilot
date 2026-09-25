import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import { can, type Capability } from "@/platform/auth/capabilities";
import LoadingScreen from "@/platform/reliability/LoadingScreen";

/** Route guard by capability (UX only: every request is authorised again by the server). */
export default function RequireCapability({
  capability,
  children,
  redirectTo = "/platform"
}: {
  capability: Capability;
  children: ReactNode;
  redirectTo?: string;
}) {
  const { loading, user } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!can(user, capability)) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
