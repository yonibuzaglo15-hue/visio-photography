import crypto from "crypto";
import { AGENTS } from "../agents/types.js";
import {
  bookingFromDetails,
  detailsFromLegacyBooking,
  emptyDetails,
  normalizeDetails,
} from "./job-details.js";

export function emptyAgentState() {
  return { status: "pending", progress: 0, message: "" };
}

/**
 * @param {object} bookingOrPayload — legacy booking fields and/or { details }
 */
export function buildJob(bookingOrPayload = {}) {
  const id = `job_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  const hasDetails = bookingOrPayload.details && typeof bookingOrPayload.details === "object";
  const details = hasDetails
    ? normalizeDetails(bookingOrPayload.details)
    : detailsFromLegacyBooking(bookingOrPayload, emptyDetails());

  // Allow top-level agency/client overrides when creating from form
  if (bookingOrPayload.agencyId) details.agency.agencyId = String(bookingOrPayload.agencyId);
  if (bookingOrPayload.agentId) details.agency.agentId = String(bookingOrPayload.agentId);
  if (bookingOrPayload.email) details.client.email = String(bookingOrPayload.email);
  if (bookingOrPayload.street) details.property.street = String(bookingOrPayload.street);
  if (bookingOrPayload.city) details.property.city = String(bookingOrPayload.city);
  if (bookingOrPayload.houseNumber) details.property.houseNumber = String(bookingOrPayload.houseNumber);

  const booking = {
    ...bookingFromDetails(details),
    // Preserve explicit legacy fields if details left them empty
    name: details.client.name || bookingOrPayload.name || bookingOrPayload.clientName || "",
    phone: details.client.phone || bookingOrPayload.phone || "",
    address:
      bookingFromDetails(details).address ||
      bookingOrPayload.address ||
      "",
    pkg: details.shoot.pkg || bookingOrPayload.pkg || bookingOrPayload.package || "SIGNATURE",
    date: details.shoot.date || bookingOrPayload.date || "",
    time: details.shoot.time || bookingOrPayload.time || "",
    notes: details.notes || bookingOrPayload.notes || "",
  };

  // Re-sync details.client/shoot from final booking defaults
  details.client.name = booking.name;
  details.client.phone = booking.phone;
  details.shoot.pkg = booking.pkg;
  details.shoot.date = booking.date;
  details.shoot.time = booking.time;
  details.notes = booking.notes;

  return {
    id,
    bookingId: bookingOrPayload.bookingId || null,
    status: "intake",
    phase: "a",
    booking,
    details,
    files: { all: [], panoramas: [], photos: [] },
    agents: {
      [AGENTS.ARIEL]: { ...emptyAgentState(), status: "done", message: "ממתין לקבצים" },
      [AGENTS.TOUR]: emptyAgentState(),
      [AGENTS.VIDEO]: emptyAgentState(),
      [AGENTS.CREATIVE]: emptyAgentState(),
    },
    outputs: {
      tourUrl: null,
      tourJsonUrl: null,
      videoUrl: null,
      graphicsUrls: [],
      script: null,
    },
    logs: [{ at: now, agent: AGENTS.ARIEL, message: "נוצר job חדש — ממתין לקבצים" }],
    createdAt: now,
    updatedAt: now,
  };
}
