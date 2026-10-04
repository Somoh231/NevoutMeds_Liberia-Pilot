import { SUPPORT_EMAIL } from "@/platform/support/contacts";

/**
 * Public self-service sign-up is disabled for the pilot: owner accounts are
 * provisioned for verified pharmacies, and staff join through their owner's
 * invitation. This is what people without a sign-in are told instead of a
 * sign-up form that would only fail. The support address is the configured
 * one (VITE_SUPPORT_EMAIL); without it, no address is shown.
 */
export default function NoAccountHelp({ who = "your organization administrator" }: { who?: string }) {
  return (
    <span className="nv-hint" data-testid="no-account-help" style={{ fontSize: "0.9375rem" }}>
      Need a NevOut Meds account? Contact {who} or{" "}
      {SUPPORT_EMAIL ? <a className="nv-link" href={`mailto:${SUPPORT_EMAIL}`}>NevOut Meds support</a> : "NevOut Meds support"}.
    </span>
  );
}
