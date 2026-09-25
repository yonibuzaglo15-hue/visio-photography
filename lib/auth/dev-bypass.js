/**
 * Local-only admin auth bypass for Playwright / headless editor tests.
 *
 * Enabled ONLY when:
 *   - NODE_ENV is not "production"
 *   - VERCEL_ENV is not "production" (defense in depth on Vercel)
 *   - DEV_AUTH_BYPASS === "1"
 *
 * Never set DEV_AUTH_BYPASS on Vercel. Production must always return false.
 */

export const DEV_BYPASS_EMAIL = "dev-bypass@localhost";
export const DEV_BYPASS_NAME = "Dev Bypass";

/**
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {boolean}
 */
export function isDevAuthBypassEnabled(env = process.env) {
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL_ENV === "production") return false;
  return env.DEV_AUTH_BYPASS === "1";
}

/**
 * Synthetic session shape matching getAllowedSession / requireAllowedApi.
 */
export function devBypassSession() {
  return {
    user: {
      email: DEV_BYPASS_EMAIL,
      name: DEV_BYPASS_NAME,
      image: null,
      allowed: true,
    },
  };
}
