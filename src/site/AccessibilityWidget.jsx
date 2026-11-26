"use client";

import { useEffect, useId, useRef, useState } from "react";

const STORAGE_KEY = "visio-a11y";
const EMPTY = { font: 0, contrast: false, gray: false, links: false, stop: false, readable: false };

function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return EMPTY;
    return { ...EMPTY, ...raw, font: [0, 1, 2, 3].includes(raw.font) ? raw.font : 0 };
  } catch {
    return EMPTY;
  }
}

function applySettings(settings) {
  const root = document.documentElement;
  root.classList.toggle("visio-a11y-contrast", settings.contrast);
  root.classList.toggle("visio-a11y-gray", settings.gray);
  root.classList.toggle("visio-a11y-links", settings.links);
  root.classList.toggle("visio-a11y-stop", settings.stop);
  root.classList.toggle("visio-a11y-readable", settings.readable);
  root.classList.remove("visio-a11y-font-1", "visio-a11y-font-2", "visio-a11y-font-3");
  if (settings.font) root.classList.add(`visio-a11y-font-${settings.font}`);
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(EMPTY);
  const titleId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    const next = readSettings();
    setSettings(next);
    applySettings(next);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      const stopped = { ...next, stop: true };
      setSettings(stopped);
      applySettings(stopped);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const node = panelRef.current;
    const focusable = node?.querySelector("button, a, input");
    focusable?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const update = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    applySettings(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <div className="visio-a11y">
      <button
        type="button"
        className="visio-a11y-launch"
        aria-expanded={open}
        aria-controls="visio-a11y-panel"
        onClick={() => setOpen((value) => !value)}
      >
        נגישות
      </button>
      {open && (
        <div
          id="visio-a11y-panel"
          className="visio-a11y-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          ref={panelRef}
        >
          <h2 id={titleId}>התאמות נגישות</h2>
          <div className="visio-a11y-row">
            <span>גודל טקסט</span>
            <span>
              <button type="button" onClick={() => update({ font: Math.max(0, settings.font - 1) })} aria-label="הקטן טקסט">א−</button>
              <button type="button" onClick={() => update({ font: Math.min(3, settings.font + 1) })} aria-label="הגדל טקסט">א+</button>
            </span>
          </div>
          {[
            ["contrast", "ניגודיות גבוהה"],
            ["gray", "גווני אפור"],
            ["links", "הדגשת קישורים"],
            ["stop", "עצירת אנימציות"],
            ["readable", "גופן קריא"],
          ].map(([key, label]) => (
            <label key={key} className="visio-a11y-row">
              <span>{label}</span>
              <input type="checkbox" checked={settings[key]} onChange={(event) => update({ [key]: event.target.checked })} />
            </label>
          ))}
          <button type="button" onClick={() => update(EMPTY)}>איפוס</button>
          <a href="/accessibility">הצהרת נגישות</a>
        </div>
      )}
    </div>
  );
}
