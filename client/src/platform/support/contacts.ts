/**
 * Pilot support contacts, set per deployment (public values, not secrets):
 *   VITE_SUPPORT_WHATSAPP  the support number, any format ("+231 77 000 0000")
 *   VITE_SUPPORT_EMAIL     a monitored support mailbox
 * Without a number, WhatsApp opens with the message ready and the person
 * chooses the recipient themselves. Without a mailbox, no email contact is
 * shown: the app never publishes an address nobody has confirmed is read.
 */
const whatsappDigits = String(import.meta.env.VITE_SUPPORT_WHATSAPP ?? "").replace(/\D+/g, "");

export const SUPPORT_WHATSAPP: string | null = whatsappDigits.length >= 8 ? whatsappDigits : null;
export const SUPPORT_EMAIL: string | null = String(import.meta.env.VITE_SUPPORT_EMAIL ?? "").trim() || null;

export function supportWhatsappHref(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP ?? ""}?text=${encodeURIComponent(message)}`;
}
