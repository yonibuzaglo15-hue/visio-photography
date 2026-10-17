"use client";

import { useEffect, useRef, useState } from "react";
import { createPsvTourViewer } from "../../../lib/tour/create-psv-viewer.js";

/**
 * Public tour viewer — Photo Sphere Viewer + VirtualTour + Map plugins.
 */
export default function TourViewerClient({ config: initialConfig }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const loadStarted = useRef(typeof performance !== "undefined" ? performance.now() : 0);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!initialConfig || !containerRef.current) return;
      setLoading(true);
      setError("");
      try {
        containerRef.current.innerHTML = "";
        const api = await createPsvTourViewer(containerRef.current, initialConfig, {
          startNodeId: initialConfig?.default?.firstScene,
          enableMap: true,
          isCancelled: () => cancelled,
          onNodeChange: () => {
            if (cancelled) return;
            setLoading(false);
          },
        });
        if (!api) return;
        if (cancelled) {
          api.destroy();
          return;
        }
        apiRef.current = api;
        if (typeof window !== "undefined") {
          window.__visioViewer = api.viewer;
          window.__visioTour = api.virtualTour;
          window.__visioMap = api.map;
        }
        const ms = performance.now() - loadStarted.current;
        if (typeof window !== "undefined") {
          window.__visioFirstSceneLoadMs = Math.round(ms);
          console.info("[visio-tour] PSV first scene load ms", Math.round(ms));
        }
        setLoading(false);
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
        apiRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      apiRef.current = null;
    };
  }, [initialConfig]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0a" }}>
      <div
        ref={containerRef}
        id="panorama"
        data-testid="tour-viewer"
        style={{ width: "100%", height: "100%" }}
      />
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
