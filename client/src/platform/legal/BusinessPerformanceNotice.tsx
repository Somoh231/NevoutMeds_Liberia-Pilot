/**
 * Business Performance & Data Use: reusable notice. Shown in the Privacy
 * Notice now. Any future Business Performance area must display or link it.
 * It deliberately does not suggest that a financing product or lender
 * relationship exists.
 */
export default function BusinessPerformanceNotice({ headingLevel = 2, id = "business-performance" }: { headingLevel?: 2 | 3; id?: string }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section id={id} className="nv-bp-notice" aria-labelledby={`${id}-title`} data-testid="business-performance-notice">
      <Heading id={`${id}-title`}>Business Performance &amp; Data Use</Heading>
      <p>
        NevOut may use pharmacy-level operating information to create business-performance evidence for a pharmacy. Examples are
        aggregate sales consistency, inventory movement, purchasing patterns, stockouts, margins and supplier activity.
      </p>
      <p>
        <strong>NevOut’s Business Performance Profile does not use identifiable customer health information or individual customer records.</strong>{" "}
        It is built from pharmacy-level figures. It does not include customer names, phone numbers, addresses, dates of birth, conditions,
        allergies, notes, reminders, individual medicine histories or customer-level credit information.
      </p>
      <p>
        It is <strong>not a credit score</strong>, and NevOut does not make lending decisions. Any financing decision is made independently by
        the relevant licensed financial institution.
      </p>
      <p>
        NevOut does not currently offer financing or share Business Performance information with lenders. Before any such sharing is offered,
        it will require the pharmacy’s authorisation and separate terms, and this notice will be updated.
      </p>
    </section>
  );
}
