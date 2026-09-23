/**
 * Turns auth and invitation errors into plain language. Users never see
 * implementation words (tokens, RLS, tenant, status codes); unknown errors
 * get a calm generic line instead of a raw server message.
 */
type Rule = [RegExp, string];

const AUTH_RULES: Rule[] = [
  [/invalid login credentials|invalid_credentials/i, "That email and password don’t match. Check both and try again."],
  [/email not confirmed|email_not_confirmed/i, "Confirm your email address first — open the link we sent to your inbox."],
  [/banned|user_banned/i, "This account is suspended. Contact your pharmacy owner to restore access."],
  [/rate limit|too many|429|over_email_send_rate_limit/i, "Too many attempts. Wait a minute, then try again."],
  [/failed to fetch|network|load failed|networkerror/i, "You’re offline or the connection dropped. Check your connection and try again."],
  [/already registered|already exists|user_already_exists/i, "An account with this email already exists. Sign in instead."],
  [/password.*(short|characters|weak|at least)/i, "Choose a longer password — at least 8 characters."],
  [/same password|different from the old/i, "Choose a password you haven’t used for this account before."],
  [/not configured/i, "Sign-in isn’t available on this installation yet."],
  [/session.*(missing|expired)|jwt expired|refresh token/i, "Your session has ended. Sign in again to continue."],
  [/invalid.*email|email.*invalid|unable to validate email/i, "Enter a valid email address."]
];

const INVITE_RULES: Rule[] = [
  [/expired/i, "This invitation has expired. Ask your pharmacy owner to send a new one."],
  [/revoked|cancel/i, "This invitation was cancelled by the pharmacy. Ask the owner if you should still join."],
  [/already been used|already accepted/i, "This invitation has already been used. If it was you, just sign in."],
  [/different email/i, "This invitation was sent to a different email address. Sign in with that address instead."],
  [/already belongs to a pharmacy/i, "This account already belongs to a pharmacy. Use a different email address to join another one."],
  [/invalid invitation/i, "This invitation link isn’t valid. Check you opened the full link, or ask for a new one."]
];

const GENERIC = "Something went wrong. Please try again.";

function messageOf(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  const anyE = e as { message?: string; code?: string; error_description?: string };
  return [anyE.code, anyE.message, anyE.error_description].filter(Boolean).join(" ");
}

export function friendlyAuthError(e: unknown): string {
  const m = messageOf(e);
  return AUTH_RULES.find(([re]) => re.test(m))?.[1] ?? GENERIC;
}

export function friendlyInviteError(e: unknown): string {
  const m = messageOf(e);
  return INVITE_RULES.find(([re]) => re.test(m))?.[1] ?? AUTH_RULES.find(([re]) => re.test(m))?.[1] ?? "This invitation could not be accepted. Ask your pharmacy owner to send a new one.";
}

/** Classifies an invitation error so the page can offer the right next step. */
export function inviteErrorKind(e: unknown): "expired" | "revoked" | "used" | "wrong-email" | "has-pharmacy" | "invalid" | "other" {
  const m = messageOf(e);
  if (/expired/i.test(m)) return "expired";
  if (/revoked|cancel/i.test(m)) return "revoked";
  if (/already been used|already accepted/i.test(m)) return "used";
  if (/different email/i.test(m)) return "wrong-email";
  if (/already belongs to a pharmacy/i.test(m)) return "has-pharmacy";
  if (/invalid invitation/i.test(m)) return "invalid";
  return "other";
}
