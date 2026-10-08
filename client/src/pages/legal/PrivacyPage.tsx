import { Link } from "react-router-dom";
import LegalLayout, { Mail } from "./LegalLayout";
import BusinessPerformanceNotice from "@/platform/legal/BusinessPerformanceNotice";

const SECTIONS = [
  ["about", "About NevOut Meds"],
  ["who", "Who this notice covers"],
  ["website", "Information on the public website"],
  ["accounts", "Pharmacy account information"],
  ["customers", "Pharmacy customer information"],
  ["sensitive", "Sensitive and health-related information"],
  ["purposes", "Why information is processed"],
  ["device", "Offline and device storage"],
  ["providers", "Service providers and international processing"],
  ["business-performance", "Business Performance Profile separation"],
  ["sharing", "Information sharing"],
  ["security", "Security"],
  ["retention", "Retention"],
  ["rights", "Privacy choices and requests"],
  ["countries", "Country-specific requirements"],
  ["changes", "Changes to this notice"],
  ["contact", "Contact"]
] as const;

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Notice" eyebrow="NevOut Meds">
      <p className="nv-legal__lede">
        This notice explains what information NevOut Meds processes, why, and the choices available to you. It applies to our public
        website and to the NevOut Meds pharmacy platform.
      </p>

      <nav className="nv-legal__toc" aria-labelledby="toc-title">
        <h2 id="toc-title">On this page</h2>
        <ol>
          {SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}
        </ol>
      </nav>

      <h2 id="about">About NevOut Meds</h2>
      <p>
        NevOut Meds (“NevOut”, “we”, “us”) provides pharmacy-operating technology: a web application, which also works offline, for stock,
        sales, customers, credit, refill reminders, suppliers and reports.
      </p>
      <p>
        NevOut provides pharmacy-operating technology that may process information entered by pharmacies, including customer contact,
        transaction, credit and health-related information where the pharmacy uses those features.
      </p>

      <h2 id="who">Who this notice covers</h2>
      <ul>
        <li>People who visit nevoutmeds.com or contact us.</li>
        <li>Pharmacy owners and staff who use the platform.</li>
        <li>
          People whose information a pharmacy records in the platform: the pharmacy’s customers and any contact person the pharmacy records
          for them.
        </li>
        <li>Supplier contacts that a pharmacy records.</li>
      </ul>
      <p>
        In many cases the pharmacy decides what customer information to record and why, and NevOut processes that information to provide the
        service to the pharmacy. For other information, such as user accounts, platform security and our website, NevOut decides how the
        information is used. The exact roles of NevOut and the pharmacy, and the rights that apply, can vary by country and by the
        relationship between NevOut and the pharmacy.
      </p>

      <h2 id="website">Information on the public website</h2>
      <ul>
        <li>
          <strong>Technical information.</strong> When your browser loads our website, our hosting provider receives technical details such as
          your IP address, browser type, the page requested and the time. This is used to deliver the website and keep it secure.
        </li>
        <li>
          <strong>No advertising or analytics.</strong> The website does not use cookies, analytics, advertising technology or tracking pixels,
          and it does not load content from third-party servers. See our <Link to="/cookies">Cookies &amp; Similar Technologies Notice</Link>.
        </li>
        <li>
          <strong>Demo requests.</strong> The demo-request form on our home page does not send information to our servers. It opens your own
          email app with a message to <Mail to="hello" /> containing your name, phone or WhatsApp number, pharmacy name and message. Nothing is sent until you choose to send that
          email.
        </li>
        <li>
          <strong>Emails to us.</strong> If you email us, we receive what you include in your message. Please do not send customer health
          information by email.
        </li>
      </ul>

      <h2 id="accounts">Pharmacy account information</h2>
      <p>For pharmacy owners and staff, we process:</p>
      <ul>
        <li>name, email address, role, pharmacy and account status;</li>
        <li>
          sign-in information: your password is stored only in protected (hashed) form, and two-step verification is required for pharmacy
          owners and available to staff;
        </li>
        <li>sign-in session records, including IP address and browser or device type;</li>
        <li>security and team records, such as two-step verification changes, invitations and role or status changes;</li>
        <li>
          service records, such as which screens are opened and error reports, linked to your account and used to keep the platform working
          and improve it;
        </li>
        <li>feedback you send us through the app.</li>
      </ul>

      <h2 id="customers">Pharmacy customer information</h2>
      <p>Depending on how a pharmacy uses the platform, it may record about its customers:</p>
      <ul>
        <li>name, phone numbers and an alternate contact person;</li>
        <li>community, landmark or area;</li>
        <li>date of birth and gender;</li>
        <li>medical conditions, allergies and notes;</li>
        <li>purchases, including the medicines bought;</li>
        <li>refill reminders;</li>
        <li>credit balances and limits, total spend and visit history.</li>
      </ul>
      <p>
        The pharmacy uses this information to serve its customers, for example to identify them at the counter, show allergy warnings when
        recording a sale, manage credit and send refill reminders. If you are a pharmacy customer and have a question about your information,
        please contact your pharmacy first. We will help the pharmacy respond where needed.
      </p>

      <h2 id="sensitive">Sensitive and health-related information</h2>
      <p>
        Medical conditions, allergies, medicines, information about children and some financial information can be sensitive or specially
        protected under the law of your country.
      </p>
      <p>
        Pharmacies are responsible for recording only the information they need, informing their customers, and obtaining consent or relying
        on another legal basis where their country’s law requires it.
      </p>
      <p>
        NevOut processes this information to provide the platform to the pharmacy. It is not used for advertising, it is not included in our
        usage statistics, and it is excluded from the Business Performance Profile.
      </p>

      <h2 id="purposes">Why information is processed</h2>
      <ul>
        <li>to provide and operate the platform and website, including offline use and synchronisation;</li>
        <li>to secure accounts and the platform and to prevent misuse;</li>
        <li>to provide support and respond to messages;</li>
        <li>to keep the platform reliable and improve it, using service records and error reports;</li>
        <li>to send account and security messages, such as invitations and password resets;</li>
        <li>to meet legal obligations and respond to lawful requests.</li>
      </ul>
      <p>
        We do not sell personal information and do not use it for advertising. The legal basis for each purpose depends on the applicable law
        and on whose behalf the information is processed.
      </p>

      <h2 id="device">Offline and device storage</h2>
      <p>
        So that a pharmacy can keep working without a connection, the app stores some information on the device: the sign-in session, a copy
        of the pharmacy’s records that the signed-in user can see (which can include customer details), and any changes waiting to be sent.
      </p>
      <p>
        Signing out removes the stored session and the copy of the pharmacy’s records from the device. Changes that have not been sent yet are
        kept on the device until they can be sent, so that sales are not lost.
      </p>
      <p>
        On shared devices, sign out at the end of each shift and lock the device when you step away. Details are in our{" "}
        <Link to="/cookies">Cookies &amp; Similar Technologies Notice</Link>.
      </p>

      <h2 id="providers">Service providers and international processing</h2>
      <p>We use service providers to run NevOut Meds:</p>
      <ul>
        <li><strong>Supabase</strong>: database, sign-in and file storage, hosted in the European Union (Ireland);</li>
        <li><strong>Vercel</strong>: website and app hosting and delivery through its global network;</li>
        <li><strong>ImprovMX</strong>: forwarding of emails sent to our @nevoutmeds.com addresses;</li>
        <li>email delivery services used to send account emails, such as invitations and password resets.</li>
      </ul>
      <p>
        These providers may process information in other countries, including the European Union and the United States. Information may
        therefore be processed outside the country where you or the pharmacy are located. Additional requirements for international transfers
        may apply depending on the country.
      </p>
      <p>
        When pharmacy users choose to send a message through WhatsApp from the app, such as a refill reminder or an order to a supplier, it is
        sent from their own WhatsApp account and WhatsApp’s terms apply.
      </p>

      <BusinessPerformanceNotice />

      <h2 id="sharing">Information sharing</h2>
      <ul>
        <li>within the pharmacy, according to each user’s role;</li>
        <li>with the service providers listed above, to run the platform;</li>
        <li>where required by law or to protect the rights, safety and security of users, pharmacies and NevOut;</li>
        <li>
          in a future financing or group-purchasing service, only with the pharmacy’s authorisation. That sharing would use pharmacy-level
          information and would not include identifiable customer or health information.
        </li>
      </ul>
      <p>We do not sell personal information.</p>

      <h2 id="security">Security</h2>
      <p>We use safeguards appropriate to a pharmacy platform, including:</p>
      <ul>
        <li>separation of each pharmacy’s records, enforced on the server;</li>
        <li>role-based access;</li>
        <li>two-step verification for pharmacy owners;</li>
        <li>encrypted connections;</li>
        <li>storage encryption provided by our hosting provider.</li>
      </ul>
      <p>
        No system is completely secure. If you believe you have found a security problem, please contact <Mail to="security" />.
      </p>

      <h2 id="retention">Retention</h2>
      <p>
        We keep information for as long as needed to provide the platform, to meet legal, accounting and professional record-keeping
        obligations, to resolve disputes and to keep the platform secure.
      </p>
      <p>
        Pharmacies decide how long their own records are kept, within the requirements of their country’s law. Retention periods can differ by
        country and type of record.
      </p>

      <h2 id="rights">Privacy choices and requests</h2>
      <p>Depending on your country, you may have rights to:</p>
      <ul>
        <li>access your information, or have it corrected or deleted;</li>
        <li>object to or restrict some processing;</li>
        <li>withdraw consent where processing is based on consent;</li>
        <li>complain to your data-protection authority.</li>
      </ul>
      <p>
        Pharmacy customers should contact their pharmacy first. Pharmacy users and others can contact <Mail to="privacy" />.
      </p>
      <p>
        We may need to confirm your identity before acting on a request. Some information may need to be kept to meet legal or record-keeping
        obligations.
      </p>

      <h2 id="countries">Country-specific requirements</h2>
      <p>
        NevOut is intended to operate in several countries. Additional rights, notices, consent requirements or regulatory requirements may
        apply depending on the country in which NevOut and the pharmacy operate. We may publish country-specific supplements to this notice.
      </p>

      <h2 id="changes">Changes to this notice</h2>
      <p>
        We will update this notice when our services or practices change, for example before introducing a new service provider, optional
        analytics or a financing feature. The date at the top shows when it was last updated.
      </p>

      <h2 id="contact">Contact</h2>
      <ul className="nv-legal__contacts">
        <li>General and demo inquiries: <Mail to="hello" /></li>
        <li>Privacy questions and requests: <Mail to="privacy" /></li>
        <li>Security reports: <Mail to="security" /></li>
        <li>Help with the app: <Mail to="support" /></li>
        <li>Partnerships: <Mail to="partnerships" /></li>
      </ul>
      <p>See also our <Link to="/terms">Terms of Use</Link> and <Link to="/cookies">Cookies &amp; Similar Technologies Notice</Link>.</p>
    </LegalLayout>
  );
}
