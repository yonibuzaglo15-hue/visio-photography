"use client";

import { useEffect, useId, useState } from "react";

const STORAGE_KEY = "visio-consent";

function readChoice() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || (raw.choice !== "accept" && raw.choice !== "reject" && raw.choice !== "custom")) return null;
    return raw;
  } catch {
    return null;
  }
}

function storeChoice(choice, analytics) {
  const value = { choice, necessary: true, analytics, at: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("visio-consent", { detail: value }));
  return value;
}

export function consentAllowsAnalytics() {
  if (typeof window === "undefined") return false;
  return readChoice()?.analytics === true;
}

export default function CookieConsent() {
  const [choice, setChoice] = useState(undefined);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const saved = readChoice();
    setChoice(saved);
    setAnalytics(saved?.analytics === true);
    const reopen = () => { setChoice(null); setSettings(true); };
    window.addEventListener("visio-open-cookies", reopen);
    return () => window.removeEventListener("visio-open-cookies", reopen);
  }, []);

  if (choice === undefined || choice) return null;

  const accept = () => setChoice(storeChoice("accept", true));
  const reject = () => setChoice(storeChoice("reject", false));
  const save = () => setChoice(storeChoice("custom", analytics));

  return (
    <div className="visio-cookies" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId}>עוגיות</h2>
      <p>
        עוגיות הכרחיות נשמרות כדי שהאתר יזכור את בחירת התצוגה ואת ההזמנה. עוגיות לא הכרחיות, כמו מדידה, נחסמות עד שתאשרו.
        {" "}
        <a href="/privacy">מדיניות הפרטיות</a>
      </p>
      {settings && (
        <label className="visio-cookies-option">
          <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
          מדידה (לא הכרחי)
        </label>
      )}
      <div className="visio-cookies-actions">
        <button type="button" className="visio-btn" onClick={accept}>אישור</button>
        <button type="button" className="visio-btn outline" onClick={reject}>דחייה</button>
        {settings
          ? <button type="button" className="visio-btn outline" onClick={save}>שמירת הגדרות</button>
          : <button type="button" className="visio-btn outline" onClick={() => setSettings(true)}>הגדרות</button>}
      </div>
    </div>
  );
}
