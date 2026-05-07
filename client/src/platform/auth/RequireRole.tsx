import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import type { Role } from "@/platform/domain";
import LoadingScreen from "@/platform/reliability/LoadingScreen";

export default function RequireRole({
  allow,
  children,
  redirectTo = "/platform"
}: {
  allow: Role[];
  children: ReactNode;
  redirectTo?: string;
}) {
  const { loading, user } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}

