/**
 * The addresses NevOut publishes. The demo account's sign-in identity is
 * deliberately not here: it must never be shown publicly.
 */
export const PUBLIC_CONTACTS = {
  /** General product and demo inquiries. */
  hello: "hello@nevoutmeds.com",
  /** Help with the app. */
  support: "support@nevoutmeds.com",
  /** Privacy questions and requests. */
  privacy: "privacy@nevoutmeds.com",
  /** Security reports. */
  security: "security@nevoutmeds.com",
  /** Partnerships. */
  partnerships: "partnerships@nevoutmeds.com"
} as const;

export type PublicContact = keyof typeof PUBLIC_CONTACTS;

/**
 * The home page demo-request form has no backend: it opens the visitor's own
 * email app with this message filled in, addressed to the general inquiries
 * address. Nothing is sent until the visitor sends it.
 */
export function demoRequestMailto(v: { name?: string; phone?: string; pharmacy?: string; message?: string }): string {
  const t = (s?: string) => String(s ?? "").trim();
  const body = [`Name: ${t(v.name)}`, `Phone / WhatsApp: ${t(v.phone)}`, `Pharmacy: ${t(v.pharmacy)}`, "", t(v.message)].join("\n");
  const subject = `Demo request: ${t(v.pharmacy) || "pharmacy"}`;
  return `mailto:${PUBLIC_CONTACTS.hello}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
