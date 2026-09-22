"use client";

import { useEffect, useRef, useState } from "react";
import {
  FLOOR_NAV_CSS,
  installFloorNav,
  prepareFloorHotspots,
} from "../../../lib/tour/floor-nav.js";
import {
  applyDevicePanoramas,
  probeMaxTextureSize,
} from "../../../lib/tour/viewer-sizes.js";

const PANNELLUM_CSS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
const PANNELLUM_JS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";

let pannellumPromise = null;
let cssInjected = false;

function ensureCss() {
  if (typeof document === "undefined" || cssInjected) return;
  if (!document.querySelector(`link[href="${PANNELLUM_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = PANNELLUM_CSS;
    document.head.appendChild(link);
  }
  if (!document.getElementById("visio-floor-nav-css")) {
    const style = document.createElement("style");
    style.id = "visio-floor-nav-css";
    style.textContent = FLOOR_NAV_CSS;
    document.head.appendChild(style);
  }
  cssInjected = true;
}

function loadPannellum() {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.pannellum) return Promise.resolve(window.pannellum);
  if (pannellumPromise) return pannellumPromise;
  pannellumPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PANNELLUM_JS}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.pannellum));
      existing.addEventListener("error", () => reject(new Error("Pannellum load failed")));
      if (window.pannellum) resolve(window.pannellum);
      return;
    }
    const script = document.createElement("script");
    script.src = PANNELLUM_JS;
    script.async = true;
    script.onload = () => resolve(window.pannellum);
    script.onerror = () => reject(new Error("Pannellum load failed"));
    document.body.appendChild(script);
  });
  return pannellumPromise;
}

/**
 * Public tour viewer — same floor-nav runtime as published HTML.
 */
export default function TourViewerClient({ config: initialConfig }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const navRef = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const loadStarted = useRef(typeof performance !== "undefined" ? performance.now() : 0);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!initialConfig || !containerRef.current) return;
      ensureCss();
      setLoading(true);
      setError("");
      try {
        const pannellum = await loadPannellum();
        if (cancelled || !containerRef.current) return;

        const config = JSON.parse(JSON.stringify(initialConfig));
        applyDevicePanoramas(config, probeMaxTextureSize());
        if (config.default) {
          config.default.sceneFadeDuration = 400;
          config.default.hotSpotDebug = false;
        }

        const walkRef = { current: null };
        prepareFloorHotspots(config, {
          onHover: (sceneId) => navRef.current?.preloadScene?.(sceneId),
          onClick: (hs) => walkRef.current?.(hs),
        });

        containerRef.current.innerHTML = "";
        const viewer = pannellum.viewer(containerRef.current, config);
        const nav = installFloorNav(viewer, config, { walkRef });
        viewerRef.current = viewer;
        navRef.current = nav;

        viewer.on("load", () => {
          if (cancelled) return;
          setLoading(false);
          const ms = performance.now() - loadStarted.current;
          if (typeof window !== "undefined") {
            window.__visioFirstSceneLoadMs = Math.round(ms);
            console.info("[visio-tour] first scene load ms", Math.round(ms));
          }
        });
        setTimeout(() => {
          if (!cancelled) setLoading(false);
        }, 8000);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "שגיאה בטעינת הסיור");
          setLoading(false);
        }
      }
    }
    boot();
    return () => {
      cancelled = true;
      try {
        navRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      try {
        viewerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      navRef.current = null;
      viewerRef.current = null;
    };
  }, [initialConfig]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0a" }}>
      <div ref={containerRef} id="panorama" style={{ width: "100%", height: "100%" }} />
      {loading && !error && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
            color: "#c9a84c",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          טוען סיור וירטואלי…
        </div>
      )}
      {error && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
            color: "#e8c070",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
            zIndex: 20,
            padding: 24,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          zIndex: 30,
          background: "rgba(201,168,76,0.92)",
          color: "#0a0a0a",
          padding: "6px 14px",
          borderRadius: 2,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
          pointerEvents: "none",
        }}
      >
        VISIO Photography
      </div>
    </div>
  );
}
