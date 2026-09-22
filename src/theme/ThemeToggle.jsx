"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "visio-theme";

function readDomTheme() {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

/**
 * Sun/moon toggle. Persists light|dark in localStorage.
 * Blocking script in root layout applies theme before first paint.
 */
export default function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = useState("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = readDomTheme();
    applyTheme(current);
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const label = theme === "light" ? "מצב לילה" : "מצב יום";
  const Icon = theme === "light" ? Moon : Sun;

  return (
    <button
      type="button"
      className={`visio-theme-toggle ${className}`.trim()}
      onClick={toggle}
      title={label}
      aria-label={label}
      suppressHydrationWarning
    >
      {mounted ? <Icon size={18} strokeWidth={1.75} aria-hidden /> : <span style={{ width: 18, height: 18 }} aria-hidden />}
    </button>
  );
}
