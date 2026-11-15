import { describe, expect, it } from "vitest";
import { legacyHostRedirect } from "../lib/canonical-host.js";

describe("legacy Vercel host redirect", () => {
  it("sends only the exact production host to visioisrael.com and keeps the path", () => {
    expect(legacyHostRedirect("visio-photography.vercel.app", "/privacy", "?x=1")).toBe(
      "https://visioisrael.com/privacy?x=1",
    );
    expect(legacyHostRedirect("VISIO-PHOTOGRAPHY.vercel.app:443", "/terms", "")).toBe(
      "https://visioisrael.com/terms",
    );
  });

  it("leaves preview deployments and the real domain alone", () => {
    expect(legacyHostRedirect("visio-photography-git-main-yonibuzaglo15.vercel.app", "/", "")).toBeNull();
    expect(legacyHostRedirect("visioisrael.com", "/privacy", "")).toBeNull();
    expect(legacyHostRedirect("visio-photography.vercel.app.evil.com", "/", "")).toBeNull();
    expect(legacyHostRedirect("", "/", "")).toBeNull();
  });
});
