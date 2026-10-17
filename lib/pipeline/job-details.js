/**
 * Pipeline job property / agency / client / shoot details.
 * Stored inside job.data JSON (Supabase) or the in-memory job object.
 * Never touches files, agents, or tour outputs.
 */

export const PROPERTY_TYPES = [
  { id: "apartment", label: "דירה" },
  { id: "private_house", label: "בית פרטי" },
  { id: "penthouse", label: "פנטהאוז" },
  { id: "garden", label: "דירת גן" },
  { id: "commercial", label: "מסחרי" },
  { id: "other", label: "אחר" },
];

export const PACKAGE_OPTIONS = [
  { id: "PHOTOS", label: "תמונות" },
  { id: "PHOTOS_VIDEO", label: "תמונות וסרטון" },
  { id: "FULL", label: "מלאה" },
  { id: "INSTAGRAM", label: "שיווק תוכן אורגני לאינסטגרם" },
  { id: "CONSULTATION", label: "VISIO CONSULTATION" },
  { id: "ESSENTIAL", label: "VISIO ESSENTIAL" },
  { id: "SIGNATURE", label: "VISIO SIGNATURE" },
  { id: "PRESTIGE", label: "VISIO PRESTIGE" },
];

export function emptyDetails() {
  return {
    property: {
      street: "",
      houseNumber: "",
      apartment: "",
      floor: "",
      city: "",
      propertyType: "",
      rooms: "",
      sqm: "",
    },
    agency: {
      agencyId: "",
      agentId: "",
    },
    client: {
      name: "",
      phone: "",
      email: "",
    },
    shoot: {
      date: "",
      time: "",
      pkg: "SIGNATURE",
    },
    notes: "",
  };
}

/** Soft Israeli phone check — warning only, never blocks save. */
export function softValidateIsraeliPhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return { ok: true, warning: null };
  const digits = raw.replace(/[\s\-()]/g, "");
  const local = digits.startsWith("+972")
    ? `0${digits.slice(4)}`
    : digits.startsWith("972")
      ? `0${digits.slice(3)}`
      : digits;
  if (/^05\d{8}$/.test(local) || /^0[2-9]\d{7,8}$/.test(local)) {
    return { ok: true, warning: null };
  }
  return {
    ok: true,
    warning: "מספר הטלפון לא נראה כמו מספר ישראלי תקין — אפשר לשמור בכל זאת",
  };
}

export function validateDetailsRequired(details) {
  const d = normalizeDetails(details);
  const errors = [];
  if (!d.property.street.trim()) errors.push("רחוב הוא שדה חובה");
  if (!d.property.city.trim()) errors.push("עיר היא שדה חובה");
  if (!d.agency.agencyId) errors.push("סוכנות היא שדה חובה");
  if (!d.agency.agentId) errors.push("סוכן מטפל הוא שדה חובה");
  return { ok: errors.length === 0, errors, details: d };
}

function str(v) {
  return v == null ? "" : String(v).trim();
}

export function normalizeDetails(input = {}) {
  const base = emptyDetails();
  const p = input.property || {};
  const a = input.agency || {};
  const c = input.client || {};
  const s = input.shoot || {};

  return {
    property: {
      street: str(p.street),
      houseNumber: str(p.houseNumber),
      apartment: str(p.apartment),
      floor: str(p.floor),
      city: str(p.city),
      propertyType: str(p.propertyType),
      rooms: str(p.rooms),
      sqm: str(p.sqm),
    },
    agency: {
      agencyId: str(a.agencyId),
      agentId: str(a.agentId),
    },
    client: {
      name: str(c.name),
      phone: str(c.phone),
      email: str(c.email),
    },
    shoot: {
      date: str(s.date),
      time: str(s.time),
      pkg: str(s.pkg) || "SIGNATURE",
    },
    notes: str(input.notes),
  };
}

/**
 * Map legacy booking + optional details into the new structure.
 * Used when loading old jobs and when creating from public booking.
 */
export function detailsFromLegacyBooking(booking = {}, existingDetails = null) {
  const base = existingDetails ? normalizeDetails(existingDetails) : emptyDetails();
  const address = str(booking.address);

  if (!base.property.street && address) {
    // Best-effort: keep full address in street until edited.
    base.property.street = address;
  }

  if (!base.client.name && booking.name) base.client.name = str(booking.name);
  if (!base.client.phone && booking.phone) base.client.phone = str(booking.phone);
  if (!base.shoot.date && booking.date) base.shoot.date = str(booking.date);
  if (!base.shoot.time && booking.time) base.shoot.time = str(booking.time);
  if (booking.pkg) base.shoot.pkg = str(booking.pkg);
  if (!base.notes && booking.notes) base.notes = str(booking.notes);

  return base;
}

export function formatPropertyLine(details) {
  const d = normalizeDetails(details);
  const streetPart = [d.property.street, d.property.houseNumber].filter(Boolean).join(" ");
  if (streetPart && d.property.city) return `${streetPart}, ${d.property.city}`;
  if (streetPart) return streetPart;
  if (d.property.city) return d.property.city;
  return "";
}

export function formatAgencyAgentLine(details, catalog) {
  const d = normalizeDetails(details);
  const agencies = catalog?.agencies || [];
  const agents = catalog?.agents || [];
  const agency = agencies.find((x) => x.id === d.agency.agencyId);
  const agent = agents.find((x) => x.id === d.agency.agentId);
  const agencyLabel = agency?.labelHe || agency?.label || "";
  const agentLabel = agent?.labelHe || agent?.label || "";
  if (agentLabel && agencyLabel) return `${agentLabel} · ${agencyLabel}`;
  return agentLabel || agencyLabel || "";
}

/** Title for job cards / dropdowns. */
export function jobDisplayTitle(job, catalog) {
  const details = ensureJobDetails(job);
  const line = formatPropertyLine(details);
  if (line) return line;
  if (job?.booking?.address) return job.booking.address;
  if (job?.booking?.name) return job.booking.name;
  return job?.id || "—";
}

export function jobDisplaySubtitle(job, catalog) {
  const details = ensureJobDetails(job);
  const agencyLine = formatAgencyAgentLine(details, catalog);
  const client = details.client.name || job?.booking?.name || "";
  if (agencyLine && client) return `${agencyLine} · ${client}`;
  return agencyLine || client || "";
}

export function jobDropdownLabel(job, catalog) {
  const details = ensureJobDetails(job);
  const prop = formatPropertyLine(details) || job?.booking?.address || job?.id || "—";
  const agent =
    formatAgencyAgentLine(details, catalog).split(" · ")[0] ||
    details.client.name ||
    job?.booking?.name ||
    "";
  return agent ? `${prop} — ${agent}` : prop;
}

export function ensureJobDetails(job) {
  if (!job) return emptyDetails();
  if (job.details) return detailsFromLegacyBooking(job.booking || {}, job.details);
  return detailsFromLegacyBooking(job.booking || {}, null);
}

/** Sync flat booking fields used by older UI / fulfill paths. */
export function bookingFromDetails(details) {
  const d = normalizeDetails(details);
  return {
    name: d.client.name,
    phone: d.client.phone,
    address: formatPropertyLine(d) || [d.property.street, d.property.city].filter(Boolean).join(", "),
    pkg: d.shoot.pkg || "SIGNATURE",
    date: d.shoot.date,
    time: d.shoot.time,
    notes: d.notes,
  };
}
