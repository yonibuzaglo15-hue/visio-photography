"use client";

export default function CookieSettingsButton({ className = "" }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("visio-open-cookies"))}>
      הגדרות עוגיות
    </button>
  );
}
