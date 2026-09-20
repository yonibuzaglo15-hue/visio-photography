"use client";

export const ADMIN = {
  bg: "#050505",
  glass: "rgba(12, 12, 10, 0.72)",
  glassBorder: "rgba(201, 168, 76, 0.18)",
  gold: "#c9a84c",
  goldDim: "#8a6a28",
  goldGlow: "rgba(201, 168, 76, 0.08)",
  text: "#e8dfc8",
  muted: "#6b6558",
  border: "rgba(255,255,255,0.06)",
  accent: "#60b0f0",
  success: "#4ade80",
  error: "#f87171",
  fontDisplay: "'Bebas Neue', sans-serif",
  fontBody: "'Heebo', sans-serif",
};

export const glassPanel = {
  background: ADMIN.glass,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: `1px solid ${ADMIN.glassBorder}`,
  borderRadius: 2,
};

export const AGENT_META = {
  ariel: { name: "אריאל", role: "Orchestrator", color: "#6b8cce" },
  tour: { name: "סיור 360°", role: "TourAgent", color: "#60b8d8" },
  video: { name: "וידאו", role: "VideoAgent", color: "#d47ab0" },
  creative: { name: "קריאייטיב", role: "CreativeAgent", color: "#8abe8a" },
};
