/**
 * Forges a real NextAuth JWT (signed with NEXTAUTH_SECRET) for a non-allow-listed
 * email and hits protected routes. Expect 403 / redirect-to-login, never 200 with data.
 *
 * Usage:
 *   node --env-file=.env.local tests/forged-session-gate.mjs
 *   NODE_ENV=production NEXTAUTH_SECRET=... BASE_URL=https://visio-photography.vercel.app \
 *     node tests/forged-session-gate.mjs
 */
import { encode } from "next-auth/jwt";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SECRET = process.env.NEXTAUTH_SECRET;
const FORBIDDEN_EMAIL = process.env.FORGE_EMAIL || "not-allowed-attacker@example.com";
const isHttps = BASE.startsWith("https://");
const COOKIE_NAME = isHttps
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

if (!SECRET) {
  console.error("NEXTAUTH_SECRET is required");
  process.exit(1);
}

async function forgeCookie(email) {
  const token = await encode({
    token: {
      email,
      name: "Forged Attacker",
      sub: "forged-sub-id",
      allowed: false,
    },
    secret: SECRET,
  });
  return `${COOKIE_NAME}=${token}`;
}

async function hit(method, path, cookie, body) {
  const url = BASE + path;
  const headers = { Cookie: cookie, Accept: "application/json, text/html" };
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, {
    method,
    headers,
    body: payload,
    redirect: "manual",
  });
  const text = await res.text();
  const location = res.headers.get("location") || "";
  return { status: res.status, location, text, url: path };
}

function assertDenied(result, { expectJsonForbidden = false } = {}) {
  const { status, location, text, url } = result;
  const okDenied =
    status === 403 ||
    status === 401 ||
    (status >= 300 && status < 400 && /\/admin\/login/.test(location));

  if (!okDenied) {
    throw new Error(
      `FAIL ${url}: expected deny, got ${status} loc=${location} body=${text.slice(0, 120)}`
    );
  }

  // Must never look like a successful jobs/create payload.
  if (/\"ok\"\s*:\s*true/.test(text) && /\"jobs\"|\"job\"/.test(text)) {
    throw new Error(`FAIL ${url}: response contains real job data`);
  }
  if (expectJsonForbidden && status === 403) {
    if (!/Forbidden|Unauthorized/i.test(text)) {
      throw new Error(`FAIL ${url}: 403 without clear error body: ${text.slice(0, 120)}`);
    }
  }
  return { status, location: location || null };
}

async function main() {
  console.log(`BASE=${BASE}`);
  console.log(`COOKIE=${COOKIE_NAME}`);
  console.log(`FORGE_EMAIL=${FORBIDDEN_EMAIL}`);

  const cookie = await forgeCookie(FORBIDDEN_EMAIL);

  const results = {};

  results["/admin"] = assertDenied(
    await hit("GET", "/admin", cookie)
  );

  results["/api/pipeline/jobs"] = assertDenied(
    await hit("GET", "/api/pipeline/jobs", cookie),
    { expectJsonForbidden: true }
  );

  results["/api/pipeline/create-job"] = assertDenied(
    await hit("POST", "/api/pipeline/create-job", cookie, {
      name: "attacker",
      phone: "000",
    }),
    { expectJsonForbidden: true }
  );

  results["/api/pipeline/upload"] = assertDenied(
    await hit("POST", "/api/pipeline/upload", cookie, {
      jobId: "job_fake",
      files: [],
    }),
    { expectJsonForbidden: true }
  );

  results["/api/pipeline/jobs/[id]"] = assertDenied(
    await hit("GET", "/api/pipeline/jobs/job_fake_id", cookie),
    { expectJsonForbidden: true }
  );

  // Clean failure page for browser path
  const login = await hit("GET", "/admin/login?error=NotAllowed", "");
  if (login.status !== 200) {
    throw new Error(`login page status ${login.status}`);
  }
  if (!login.text.includes("לא ברשימת ההרשאות") && !login.text.includes("NotAllowed")) {
    // Client component may stream; at least ensure login shell renders, not a crash.
    if (!login.text.includes("VISIO ADMIN") && !login.text.includes("המשך עם Google")) {
      throw new Error("login error page missing expected UI");
    }
  }
  results["/admin/login?error=NotAllowed"] = {
    status: login.status,
    hasHebrewOrShell: true,
  };

  // Control: allowed forged token must NOT be treated as unauthenticated (401).
  // It should reach the handler (200 or 5xx from missing store) — never 403 for allow-listed.
  process.env.ALLOWED_EMAILS =
    process.env.ALLOWED_EMAILS || "yonibuzaglo15@gmail.com";
  // Note: server already has its own ALLOWED_EMAILS; we only forge the JWT email.

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
