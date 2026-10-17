import { describe, it, expect } from "vitest";
import { buildBrandingJob } from "../lib/branding/job-factory.js";
import { isValidAgencyAgent, listAgents, listAgencies } from "../lib/branding/catalog.js";

describe("branding catalog", () => {
  it("lists agencies and agents from the pack snapshot", () => {
    const agencies = listAgencies();
    const agents = listAgents();
    expect(agencies.some((a) => a.id === "rehouse")).toBe(true);
    expect(agents.some((a) => a.id === "liran")).toBe(true);
    expect(agents.some((a) => a.id === "yan")).toBe(true);
  });

  it("filters agents by agency", () => {
    const rehouse = listAgents("rehouse").map((a) => a.id);
    expect(rehouse).toContain("yan");
    expect(rehouse).not.toContain("liran");
  });

  it("validates agency/agent pairs", () => {
    expect(isValidAgencyAgent("rehouse", "yan")).toBe(true);
    expect(isValidAgencyAgent("independent", "liran")).toBe(true);
    expect(isValidAgencyAgent("rehouse", "liran")).toBe(false);
  });
});

describe("branding job factory", () => {
  it("creates a pending job with empty originals", () => {
    const job = buildBrandingJob({
      city: "אשדוד",
      street: "הרצל 1",
      agencyId: "independent",
      agentId: "liran",
      createdBy: "test@example.com",
    });
    expect(job.id).toMatch(/^bj_/);
    expect(job.status).toBe("pending");
    expect(job.originals).toEqual([]);
    expect(job.outputs).toEqual([]);
    expect(job.agentId).toBe("liran");
  });
});
