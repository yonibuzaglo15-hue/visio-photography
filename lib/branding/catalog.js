import { readFileSync } from "fs";
import path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "branding-catalog.json");

let cached = null;
let cachedAt = 0;
const CACHE_MS = 5_000;

export function loadBrandingCatalog() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;
  const raw = readFileSync(CATALOG_PATH, "utf8");
  cached = JSON.parse(raw);
  cachedAt = now;
  return cached;
}

export function listAgencies() {
  return loadBrandingCatalog().agencies || [];
}

export function listAgents(agencyId) {
  const agents = loadBrandingCatalog().agents || [];
  if (!agencyId) return agents;
  return agents.filter((a) => a.agencyId === agencyId);
}

export function getAgent(agentId) {
  return (loadBrandingCatalog().agents || []).find((a) => a.id === agentId) || null;
}

export function isValidAgencyAgent(agencyId, agentId) {
  const agent = getAgent(agentId);
  return !!(agent && agent.agencyId === agencyId);
}
