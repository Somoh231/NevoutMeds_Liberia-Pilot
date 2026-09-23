import AuthLayout from "@/platform/auth/AuthLayout";
import { Alert } from "@/platform/ui";

/**
 * Shown only by a build deployed without its backend settings. Users get a
 * calm message; the operator detail is kept to one line at the bottom.
 */
export default function SupabaseNotConfiguredScreen({
  title = "Sign-in isn’t available yet",
  subtitle = "This installation of NevOut Meds hasn’t been connected to its pharmacy data yet. Please try again later."
}: {
  title?: string;
  subtitle?: string;
  showBackToSite?: boolean;
}) {
  return (
    <AuthLayout title={title} subtitle={subtitle}>
      <div style={{ marginTop: 24 }}>
        <Alert tone="info" title="For the person who set this up">
          The build is missing its backend URL and public key. Add them to the deployment’s environment and redeploy.
        </Alert>
      </div>
    </AuthLayout>
  );
}
