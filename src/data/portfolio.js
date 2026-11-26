import portfolio from "./portfolio.json";

// Newest first. Add a shoot by putting one object at the top of portfolio.json
// and a folder of stills in public/portfolio/<slug>/. See README and portfolio.schema.json.
export const PORTFOLIO = portfolio;

// Six covers on the "הכל" tab: three ReHouse, then three RE/MAX.
export const SELECTED_WORK_IDS = [19, 27, 17, 30, 16, 11];

export const PORTFOLIO_FILTERS = [
  { id: "all", label: "הכל" },
  { id: "rehouse", label: "REHOUSE" },
  { id: "remax", label: "RE/MAX" },
];

export const companyOf = (p) => p.company || (/re\s*\/?\s*max/i.test(p.partner || "") ? "remax" : /re\s*house/i.test(p.partner || "") ? "rehouse" : null);

const KNOWN_CITIES = ["אשדוד", "אשקלון", "יבנה"];

export const cityOf = (p) => p.city || [p.sub, p.title].map(t => (t || "").split("·").map(x => x.trim()).reverse().find(x => KNOWN_CITIES.includes(x))).find(Boolean) || "אחר";

export const groupByCity = (cards) => {
  const order = ["אשדוד", "אשקלון", "יבנה"];
  const map = new Map();
  for (const p of cards) { const c = cityOf(p); if (!map.has(c)) map.set(c, []); map.get(c).push(p); }
  const rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
  return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, "he")).map(([city, items]) => ({ city, items }));
};

// The partner name is never part of this line. VISIO is the photographer.
export const cardTagLine = (p) => {
  const tags = p.tags || [];
  const has3d = tags.some(t => /3D/i.test(t));
  return [...tags, !has3d && (p.tour || p.matterport) && "3D TOUR"].filter(Boolean).join(" · ");
};
