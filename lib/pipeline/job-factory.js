import crypto from "crypto";
import { AGENTS } from "../agents/types.js";

export function emptyAgentState() {
  return { status: "pending", progress: 0, message: "" };
}

export function buildJob(booking = {}) {
  const id = `job_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  return {
    id,
    bookingId: booking.bookingId || null,
    status: "intake",
    phase: "a",
    booking: {
      name: booking.name || "",
      phone: booking.phone || "",
      address: booking.address || "",
      pkg: booking.pkg || "SIGNATURE",
      date: booking.date || "",
      time: booking.time || "",
      notes: booking.notes || "",
    },
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
