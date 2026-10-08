import { Link } from "react-router-dom";
import LegalLayout, { Mail } from "./LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Use" eyebrow="NevOut Meds">
      <p className="nv-legal__lede">
        These terms apply to the NevOut Meds pharmacy platform and website. By signing in or using the platform you agree to them. If your
        pharmacy has a separate written agreement with NevOut, that agreement also applies and takes priority where the two differ.
      </p>

      <h2>1. Who can use the platform</h2>
      <p>
        The platform is for pharmacies and the people they authorise. Pharmacy owner accounts are set up by NevOut. Staff join through an
        invitation from their pharmacy. Each person must use their own account and must be allowed by their pharmacy to use it.
      </p>

      <h2>2. Pharmacy accounts</h2>
      <p>
        The pharmacy owner manages who in the pharmacy can use the platform and what they can do. Owners should remove or suspend access
        promptly when someone leaves or should no longer have access.
      </p>

      <h2>3. Sign-in details and two-step verification</h2>
      <ul>
        <li>Keep your password private and do not share your account.</li>
        <li>Two-step verification is required for pharmacy owners and recommended for staff.</li>
        <li>On shared devices, sign out when you finish and lock the device when you step away.</li>
        <li>Tell your pharmacy owner, and us at <Mail to="security" />, if you think your account has been misused.</li>
      </ul>

      <h2>4. Lawful use and information you enter</h2>
      <p>
        You must use the platform lawfully. The pharmacy is responsible for the information it and its users enter, including information about
        its customers. That includes:
      </p>
      <ul>
        <li>having the right to record and use the information;</li>
        <li>keeping it accurate;</li>
        <li>informing customers and obtaining consent where the law requires.</li>
      </ul>
      <p>Our <Link to="/privacy">Privacy Notice</Link> explains how NevOut processes information.</p>

      <h2>5. Professional and legal obligations</h2>
      <p>The pharmacy remains responsible for:</p>
      <ul>
        <li>its professional and regulatory obligations, including dispensing decisions, prescription requirements and records required by law;</li>
        <li>its tax and accounting duties.</li>
      </ul>
      <p>
        Features such as allergy warnings, reorder suggestions, Analyst findings and reports support decisions. They are not medical,
        pharmaceutical, financial or legal advice, and they depend on the information entered. NevOut Meds is not designed or certified as a
        statutory prescription register.
      </p>

      <h2>6. Offline use</h2>
      <p>
        The platform is designed to keep working without a connection. Changes made offline are stored on the device and sent when a connection
        returns. Changes can conflict with changes made elsewhere, and the app will ask you to review them. Information stored offline is only as
        current as the last successful synchronisation.
      </p>

      <h2>7. Availability and changes to the service</h2>
      <p>
        We work to keep the platform available and reliable, but we do not guarantee uninterrupted service. We may update, improve or change
        features. We will try to give notice of changes that significantly affect how pharmacies use the platform.
      </p>

      <h2>8. Prohibited use</h2>
      <p>You must not:</p>
      <ul>
        <li>access another pharmacy’s information or try to get around security or access controls;</li>
        <li>share your account or use someone else’s;</li>
        <li>upload malicious code, or disrupt or overload the platform;</li>
        <li>use the platform for unlawful purposes, or to record information you have no right to record;</li>
        <li>copy, resell or reverse-engineer the platform, except as allowed by law.</li>
      </ul>

      <h2>9. Intellectual property</h2>
      <p>
        NevOut owns the platform and its software, design and content. The pharmacy keeps its rights in the information it enters. The pharmacy
        allows NevOut to process that information to provide, secure and support the platform, as described in the Privacy Notice.
      </p>

      <h2>10. Third-party services</h2>
      <p>
        The platform relies on service providers for hosting, sign-in and email. Some features open other services that you choose to use, such
        as WhatsApp. Those services have their own terms.
      </p>

      <h2>11. Suspension and termination</h2>
      <ul>
        <li>We may suspend or end access to protect the platform, users or the public, or if these terms are seriously broken.</li>
        <li>Where it is safe and practical, we will tell you first.</li>
        <li>
          A pharmacy may stop using the platform at any time. Contact <Mail to="support" /> about access to your pharmacy’s information when you
          leave.
        </li>
      </ul>

      <h2>12. Disclaimers and limitation of liability</h2>
      <p>The platform is provided as it is and as available, to the extent permitted by law.</p>
      <p>
        To the extent permitted by law, NevOut is not liable for indirect or consequential losses, or for losses caused by information entered
        incorrectly, by decisions made by the pharmacy, or by events outside our reasonable control.
      </p>
      <p>
        Nothing in these terms limits any liability that cannot be limited by law. Nothing in these terms takes away rights that pharmacies,
        users, patients or consumers have under applicable law.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms. The date at the top shows the latest version. If a change significantly affects your use of the platform,
        we will tell you before it takes effect.
      </p>

      <h2>14. Contact</h2>
      <ul className="nv-legal__contacts">
        <li>General inquiries: <Mail to="hello" /></li>
        <li>Support: <Mail to="support" /></li>
        <li>Privacy: <Mail to="privacy" /></li>
        <li>Security: <Mail to="security" /></li>
        <li>Partnerships: <Mail to="partnerships" /></li>
      </ul>
    </LegalLayout>
  );
}
