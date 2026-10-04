import { useState } from "react";
import { useAuth } from "@/platform/auth/AuthProvider";
import AuthLayout from "@/platform/auth/AuthLayout";
import { Button, EmptyState } from "@/platform/ui";
import { TriangleAlert } from "@/platform/ui/icons";

/**
 * Shown by the email-link pages (password setup/reset, invitation, sign-up
 * confirmation) when the link carried a sign-in but someone is already signed in
 * on this device. The link is never allowed to switch accounts; the person signs
 * out and opens the link from their message again. There is deliberately no
 * "continue with the link" shortcut: a crafted link must not be one click away
 * from moving a signed-in pharmacist into another account.
 */
export default function UrlSessionRefused() {
  const { user, signOut } = useAuth();
  const [signedOut, setSignedOut] = useState(false);
  return (
    <AuthLayout title="Someone is already signed in" back={null}>
      <EmptyState icon={<TriangleAlert size={26} />} tone="warning" title={signedOut ? "Signed out. Now open the link from your message again." : "This link can’t be used while another account is signed in on this device."}>
        {signedOut
          ? "For your security the link was not used automatically."
          : `${user?.name ? `${user.name} is` : "An account is"} signed in here. To use the link, sign out first, then open the link from your message again.`}
      </EmptyState>
      {!signedOut && (
        <Button variant="primary" block onClick={async () => { await signOut(); setSignedOut(true); }}>Sign out</Button>
      )}
    </AuthLayout>
  );
}
