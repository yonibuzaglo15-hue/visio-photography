import { isEmailAllowed } from "./allowlist.js";

/**
 * Gate for NextAuth signIn callback.
 * Rejects missing/non-allow-listed emails and unverified Google emails.
 *
 * @param {{ user?: { email?: string|null, emailVerified?: boolean|null }, profile?: { email_verified?: boolean } }} args
 * @returns {boolean}
 */
export function canSignIn({ user, profile } = {}) {
  const email = user?.email;
  if (!isEmailAllowed(email)) return false;

  // Google OIDC: email_verified on the profile. Explicit false → reject.
  if (profile && Object.prototype.hasOwnProperty.call(profile, "email_verified")) {
    if (profile.email_verified !== true) return false;
  }

  // Some adapters put a Date/boolean on user.emailVerified.
  if (user && Object.prototype.hasOwnProperty.call(user, "emailVerified")) {
    if (user.emailVerified === false || user.emailVerified == null) return false;
  }

  return true;
}
