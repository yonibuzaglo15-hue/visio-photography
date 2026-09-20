import { describe, expect, it } from "vitest";
import { encode, decode } from "next-auth/jwt";
import { isEmailAllowed } from "../lib/auth/allowlist.js";

/**
 * Unit-level proof that a JWT forged for a non-allow-listed email decodes
 * as a valid NextAuth token but fails the allow-list check used by middleware.
 */
describe("forged NextAuth JWT allow-list gate", () => {
  const secret = "test-secret-for-forged-jwt-unit-tests-32b";

  it("encodes/decodes a valid token for a non-allowed email", async () => {
    process.env.ALLOWED_EMAILS = "yonibuzaglo15@gmail.com";
    const email = "not-allowed-attacker@example.com";
    const encoded = await encode({
      token: { email, name: "Attacker", sub: "x" },
      secret,
    });
    const decoded = await decode({ token: encoded, secret });
    expect(decoded.email).toBe(email);
    expect(isEmailAllowed(decoded.email)).toBe(false);
  });

  it("allow-listed forged token passes isEmailAllowed", async () => {
    process.env.ALLOWED_EMAILS = "yonibuzaglo15@gmail.com";
    const email = "yonibuzaglo15@gmail.com";
    const encoded = await encode({
      token: { email, name: "Yoni", sub: "y" },
      secret,
    });
    const decoded = await decode({ token: encoded, secret });
    expect(isEmailAllowed(decoded.email)).toBe(true);
  });
});
