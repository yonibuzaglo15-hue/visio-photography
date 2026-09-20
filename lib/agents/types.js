/** @typedef {'intake' | 'processing' | 'ready' | 'error'} PipelineStatus */
/** @typedef {'a' | 'b' | 'c'} PipelinePhase */
/** @typedef {'pending' | 'running' | 'done' | 'error' | 'skipped'} AgentStatus */
/** @typedef {'panorama' | 'photo'} FileType */

/**
 * @typedef {Object} PipelineFile
 * @property {string} id
 * @property {string} name
 * @property {string} url
 * @property {FileType} type
 * @property {string[]} assignedTo - tour | creative | video
 */

/**
 * @typedef {Object} AgentState
 * @property {AgentStatus} status
 * @property {number} progress
 * @property {string} [message]
 * @property {string} [startedAt]
 * @property {string} [completedAt]
 */

/**
 * @typedef {Object} PipelineJob
 * @property {string} id
 * @property {string|null} bookingId
 * @property {PipelineStatus} status
 * @property {PipelinePhase} phase
 * @property {Object} booking
 * @property {Object} files
 * @property {Object} agents
 * @property {Object} outputs
 * @property {Array} logs
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export const AGENTS = {
  ARIEL: "ariel",
  TOUR: "tour",
  VIDEO: "video",
  CREATIVE: "creative",
};

export const AGENT_META = {
  ariel: {
    id: "ariel",
    name: "אריאל",
    role: "Master Orchestrator",
    icon: "👔",
    color: "#6b8cce",
    desc: "מנהל את צינור העיבוד, ממיין קבצים ומפעיל את תתי-הסוכנים.",
  },
  tour: {
    id: "tour",
    name: "סוכן סיור וירטואלי",
    role: "TourAgent",
    icon: "🌐",
    color: "#60b8d8",
    desc: "עיבוד תמונות 360° והטמעה בנגן Pannellum.",
  },
  video: {
    id: "video",
    name: "סוכן וידאו",
    role: "VideoAgent",
    icon: "🎬",
    color: "#d47ab0",
    desc: "תסריט, קריינות והפקת סרטון שיווקי (Runway / Make.com).",
  },
  creative: {
    id: "creative",
    name: "סוכן קריאייטיב",
    role: "CreativeAgent",
    icon: "🖼️",
    color: "#8abe8a",
    desc: "השבחת תמונות וסטייג'ינג וירטואלי (Magnific AI).",
  },
};

export const PHASE_LABELS = {
  a: "שלב א׳ — קליטת קבצים",
  b: "שלב ב׳ — עיבוד (360 + וידאו + גרפיקה)",
  c: "שלב ג׳ — נכס מוכן לשיווק",
};

export const STATUS_LABELS = {
  intake: { label: "קליטת קבצים", color: "#c9a84c", icon: "📥" },
  processing: { label: "עיבוד פעיל", color: "#60b0f0", icon: "⚡" },
  ready: { label: "מוכן לשיווק", color: "#4ade80", icon: "✅" },
  error: { label: "שגיאה", color: "#ef4444", icon: "⚠️" },
};
