import { describe, expect, it } from "vitest";
import { isDevAuthBypassEnabled } from "../lib/auth/dev-bypass.js";

describe("isDevAuthBypassEnabled", () => {
  it("is false in production even when DEV_AUTH_BYPASS=1", () => {
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "production",
        DEV_AUTH_BYPASS: "1",
      })
    ).toBe(false);
  });

  it("is false when VERCEL_ENV is production even if NODE_ENV is development", () => {
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "development",
        VERCEL_ENV: "production",
        DEV_AUTH_BYPASS: "1",
      })
    ).toBe(false);
  });

  it("is false when the env var is missing", () => {
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "development",
      })
    ).toBe(false);
  });

  it("is false when the env var is not exactly 1", () => {
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "true",
      })
    ).toBe(false);
  });

  it("is true only in non-production with DEV_AUTH_BYPASS=1", () => {
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "1",
      })
    ).toBe(true);
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "test",
        DEV_AUTH_BYPASS: "1",
      })
    ).toBe(true);
  });
});
