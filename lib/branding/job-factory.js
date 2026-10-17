import crypto from "crypto";

/**
 * @param {object} input
 * @param {string} input.city
 * @param {string} input.street
 * @param {string} input.agencyId
 * @param {string} input.agentId
 * @param {string} [input.title]
 * @param {string} [input.propertyType]
 * @param {string} [input.notes]
 * @param {string} [input.createdBy]
 */
export function buildBrandingJob(input) {
  const now = new Date().toISOString();
  return {
    id: `bj_${crypto.randomBytes(8).toString("hex")}`,
    status: "pending",
    city: String(input.city || "").trim(),
    street: String(input.street || "").trim(),
    agencyId: String(input.agencyId || "").trim(),
    agentId: String(input.agentId || "").trim(),
    title: input.title ? String(input.title).trim() : "",
    propertyType: input.propertyType ? String(input.propertyType).trim() : "",
    notes: input.notes ? String(input.notes).trim() : "",
    createdBy: input.createdBy || null,
    originals: [],
    outputs: [],
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}
