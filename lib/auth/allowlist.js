/**
 * Comma-separated allow-list from ALLOWED_EMAILS.
 * Comparison is case-insensitive; empty list means nobody is allowed.
 */

export function parseAllowedEmails(raw = process.env.ALLOWED_EMAILS || "") {
  return String(raw)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email) {
  if (!email || typeof email !== "string") return false;
  const allowed = parseAllowedEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}
