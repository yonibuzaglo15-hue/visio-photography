import { beforeEach, describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "../lib/auth/allowlist.js";
import { canSignIn } from "../lib/auth/signInGate.js";
import { authOptions } from "../lib/auth/options.js";

describe("parseAllowedEmails / isEmailAllowed", () => {
  beforeEach(() => {
    process.env.ALLOWED_EMAILS = "yonibuzaglo15@gmail.com, other@example.com";
  });

  it("allows an allow-listed email", () => {
    expect(isEmailAllowed("yonibuzaglo15@gmail.com")).toBe(true);
  });

  it("rejects a non-allow-listed email", () => {
    expect(isEmailAllowed("stranger@gmail.com")).toBe(false);
  });

  it("allows an allow-listed email with different casing", () => {
    expect(isEmailAllowed("YoniBuzaglo15@Gmail.COM")).toBe(true);
  });

  it("allows an allow-listed email with surrounding whitespace", () => {
    expect(isEmailAllowed("  yonibuzaglo15@gmail.com  ")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isEmailAllowed("")).toBe(false);
  });

  it("rejects null / undefined / non-string", () => {
    expect(isEmailAllowed(null)).toBe(false);
    expect(isEmailAllowed(undefined)).toBe(false);
    expect(isEmailAllowed(123)).toBe(false);
  });

  it("rejects everyone when ALLOWED_EMAILS is empty", () => {
    process.env.ALLOWED_EMAILS = "";
    expect(isEmailAllowed("yonibuzaglo15@gmail.com")).toBe(false);
    expect(parseAllowedEmails("")).toEqual([]);
  });
});

describe("canSignIn (NextAuth signIn gate)", () => {
  beforeEach(() => {
    process.env.ALLOWED_EMAILS = "yonibuzaglo15@gmail.com";
  });

  it("allows an allow-listed Google profile with email_verified true", () => {
    expect(
      canSignIn({
        user: { email: "yonibuzaglo15@gmail.com" },
        profile: { email_verified: true },
      })
    ).toBe(true);
  });

  it("rejects a non-allow-listed email even if verified", () => {
    expect(
      canSignIn({
        user: { email: "stranger@gmail.com" },
        profile: { email_verified: true },
      })
    ).toBe(false);
  });

  it("rejects allow-listed email when email_verified is false", () => {
    expect(
      canSignIn({
        user: { email: "yonibuzaglo15@gmail.com" },
        profile: { email_verified: false },
      })
    ).toBe(false);
  });

  it("rejects when profile.email_verified is missing but key is present as falsey", () => {
    expect(
      canSignIn({
        user: { email: "yonibuzaglo15@gmail.com" },
        profile: { email_verified: 0 },
      })
    ).toBe(false);
  });

  it("rejects null email", () => {
    expect(canSignIn({ user: { email: null }, profile: { email_verified: true } })).toBe(false);
  });

  it("rejects empty email", () => {
    expect(canSignIn({ user: { email: "" }, profile: { email_verified: true } })).toBe(false);
  });
});

describe("authOptions.signIn callback", () => {
  beforeEach(() => {
    process.env.ALLOWED_EMAILS = "yonibuzaglo15@gmail.com";
  });

  it("returns false for non-allowed Google profile", async () => {
    const ok = await authOptions.callbacks.signIn({
      user: { email: "hacker@evil.com" },
      profile: { email_verified: true },
    });
    expect(ok).toBe(false);
  });

  it("returns false when email_verified is false", async () => {
    const ok = await authOptions.callbacks.signIn({
      user: { email: "yonibuzaglo15@gmail.com" },
      profile: { email_verified: false },
    });
    expect(ok).toBe(false);
  });

  it("returns true for allowed + verified", async () => {
    const ok = await authOptions.callbacks.signIn({
      user: { email: "yonibuzaglo15@gmail.com" },
      profile: { email_verified: true },
    });
    expect(ok).toBe(true);
  });
});
