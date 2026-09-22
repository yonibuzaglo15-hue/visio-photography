"use client";

export const ADMIN = {
  bg: "var(--visio-bg)",
  glass: "var(--visio-glass)",
  glassBorder: "var(--visio-glass-border)",
  gold: "var(--visio-gold)",
  goldDim: "var(--visio-gold-dim)",
  goldGlow: "var(--visio-gold-glow)",
  text: "var(--visio-text)",
  muted: "var(--visio-muted-soft)",
  border: "var(--visio-border-subtle)",
  accent: "var(--visio-accent)",
  success: "var(--visio-success)",
  error: "var(--visio-error)",
  fontDisplay: "'Bebas Neue', sans-serif",
  fontBody: "'Heebo', sans-serif",
  panel: "var(--visio-panel)",
  panelBorder: "var(--visio-border-subtle)",
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
