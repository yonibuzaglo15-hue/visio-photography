"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  MapPin,
  MousePointerClick,
  Eye,
  Save,
  Trash2,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { ADMIN, glassPanel } from "./theme.js";

const PANNELLUM_CSS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
const PANNELLUM_JS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";

let pannellumLoadPromise = null;

function loadPannellum() {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.pannellum) return Promise.resolve(window.pannellum);
  if (pannellumLoadPromise) return pannellumLoadPromise;

  pannellumLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${PANNELLUM_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = PANNELLUM_CSS;
      document.head.appendChild(link);
    }

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

  return pannellumLoadPromise;
}

function jobLabel(job) {
  const addr = job.booking?.address;
  const name = job.booking?.name;
  if (addr || name) return [name, addr].filter(Boolean).join(" · ");
  return job.id;
}

function newHotspotId() {
  return `hs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function probeTextureLimit() {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return null;
    return gl.getParameter(gl.MAX_TEXTURE_SIZE);
  } catch {
    return null;
  }
}

async function measurePanorama(url) {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const dimPromise = new Promise((resolve, reject) => {
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("image load failed"));
    });
    img.src = url;

    let bytes = null;
    try {
      const head = await fetch(url, { method: "HEAD", mode: "cors" });
      const len = head.headers.get("content-length");
      if (len) bytes = Number(len);
    } catch {
      /* HEAD may fail CORS; ignore */
    }

    const dim = await dimPromise;
    return { ...dim, bytes };
  } catch {
    return null;
  }
}

export default function TourEditor() {
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState("");
  const [scenes, setScenes] = useState([]);
  const [firstSceneId, setFirstSceneId] = useState("");
  const [activeSceneId, setActiveSceneId] = useState("");
  const [tourUrl, setTourUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [placeMode, setPlaceMode] = useState(false);
  const [pendingTarget, setPendingTarget] = useState("");
  const [dirty, setDirty] = useState(false);
  const [textureLimit, setTextureLimit] = useState(null);
  const [panoMeta, setPanoMeta] = useState(null);
  const [viewerReady, setViewerReady] = useState(false);

  const viewerRef = useRef(null);
  const containerRef = useRef(null);
  const placeModeRef = useRef(false);
  const pendingTargetRef = useRef("");
  const scenesRef = useRef(scenes);
  const activeSceneIdRef = useRef(activeSceneId);

  useEffect(() => {
    placeModeRef.current = placeMode;
  }, [placeMode]);
  useEffect(() => {
    pendingTargetRef.current = pendingTarget;
  }, [pendingTarget]);
  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);
  useEffect(() => {
    activeSceneIdRef.current = activeSceneId;
  }, [activeSceneId]);

  useEffect(() => {
    setTextureLimit(probeTextureLimit());
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/jobs");
      const data = await res.json();
      if (!data.ok) return;
      const withPanos = (data.jobs || []).filter((j) => {
        const panos = j.files?.panoramas?.length || 0;
        const allPanos = (j.files?.all || []).filter((f) => f.type === "panorama").length;
        return panos + allPanos > 0 || j.outputs?.tourJsonUrl || j.outputs?.tourUrl;
      });
      setJobs(withPanos);
      if (!jobId && withPanos[0]) setJobId(withPanos[0].id);
    } catch {
      /* ignore */
    }
  }, [jobId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const destroyViewer = useCallback(() => {
    if (viewerRef.current) {
      try {
        viewerRef.current.destroy();
      } catch {
        /* ignore */
      }
      viewerRef.current = null;
    }
    setViewerReady(false);
  }, []);

  const loadTour = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setError("");
    setOkMsg("");
    setPlaceMode(false);
    setDirty(false);
    destroyViewer();

    try {
      const res = await fetch(`/api/pipeline/jobs/${id}/tour`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "טעינה נכשלה");

      if (data.provider === "kuula") {
        setError("הסיור הזה ב-Kuula — עורך הקישורים תומך רק ב-Pannellum על Blob.");
        setScenes([]);
        setTourUrl(data.tourUrl);
        return;
      }

      const list = data.scenes || [];
      setScenes(list);
      setFirstSceneId(data.firstSceneId || list[0]?.id || "");
      setActiveSceneId(list[0]?.id || "");
      setTourUrl(data.tourUrl);
      if (list.length === 0) {
        setError("אין פנורמות ב-job. העלה קבצי X4 בטאב Pipeline קודם.");
      }
    } catch (err) {
      setError(err.message || "שגיאה");
      setScenes([]);
    } finally {
      setLoading(false);
    }
  }, [destroyViewer]);

  useEffect(() => {
    if (jobId) loadTour(jobId);
  }, [jobId, loadTour]);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || null;

  useEffect(() => {
    let cancelled = false;
    if (!activeScene?.panoramaUrl) {
      setPanoMeta(null);
      return undefined;
    }
    measurePanorama(activeScene.panoramaUrl).then((meta) => {
      if (!cancelled) setPanoMeta(meta);
    });
    return () => {
      cancelled = true;
    };
  }, [activeScene?.panoramaUrl]);

  const applySceneUpdate = useCallback((sceneId, updater) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? updater(s) : s))
    );
    setDirty(true);
  }, []);

  const mountViewer = useCallback(async () => {
    if (!activeScene?.panoramaUrl || !containerRef.current) return;

    destroyViewer();
    setViewerReady(false);

    try {
      const pannellum = await loadPannellum();
      if (!containerRef.current) return;

      containerRef.current.innerHTML = "";
      const viewer = pannellum.viewer(containerRef.current, {
        type: "equirectangular",
        panorama: activeScene.panoramaUrl,
        autoLoad: true,
        showControls: true,
        compass: true,
        yaw: activeScene.yaw ?? 0,
        pitch: activeScene.pitch ?? 0,
        hfov: activeScene.hfov ?? 100,
        hotSpotDebug: false,
        crossOrigin: "anonymous",
        hotSpots: (activeScene.hotSpots || []).map((h) => ({
          id: h.id,
          pitch: h.pitch,
          yaw: h.yaw,
          type: "info",
          text: h.text || scenesRef.current.find((s) => s.id === h.targetSceneId)?.title || "חץ",
          cssClass: "visio-editor-hotspot",
        })),
      });

      let pointerDown = null;
      viewer.on("mousedown", (event) => {
        pointerDown = { x: event.clientX, y: event.clientY, event };
      });
      viewer.on("mouseup", (event) => {
        if (!placeModeRef.current || !pointerDown) return;
        const moved = Math.hypot(
          event.clientX - pointerDown.x,
          event.clientY - pointerDown.y
        );
        const sourceEvent = moved < 6 ? pointerDown.event : null;
        pointerDown = null;
        if (!sourceEvent) return;

        const targetId = pendingTargetRef.current;
        if (!targetId) return;

        const coords = viewer.mouseEventToCoords(sourceEvent);
        if (!coords) return;
        const [pitch, yaw] = coords;
        const sceneId = activeSceneIdRef.current;
        const target = scenesRef.current.find((s) => s.id === targetId);

        applySceneUpdate(sceneId, (scene) => ({
          ...scene,
          hotSpots: [
            ...(scene.hotSpots || []),
            {
              id: newHotspotId(),
              pitch,
              yaw,
              targetSceneId: targetId,
              text: target?.title || "חדר",
            },
          ],
        }));

        setPlaceMode(false);
        setOkMsg("חץ נוסף — שמור כדי לפרסם");
      });

      viewerRef.current = viewer;
      setViewerReady(true);
    } catch (err) {
      setError(err.message || "שגיאה בטעינת הצופה");
    }
  }, [activeScene, destroyViewer, applySceneUpdate]);

  // Remount viewer when scene identity or hotspot count changes for that scene
  const hotspotSignature = activeScene
    ? `${activeScene.id}:${(activeScene.hotSpots || []).map((h) => h.id).join(",")}`
    : "";

  useEffect(() => {
    if (!activeScene?.panoramaUrl) return undefined;
    mountViewer();
    return () => destroyViewer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount on scene/hotspot identity only
  }, [activeScene?.id, activeScene?.panoramaUrl, hotspotSignature]);

  const captureStartView = () => {
    const viewer = viewerRef.current;
    if (!viewer || !activeSceneId) return;
    applySceneUpdate(activeSceneId, (scene) => ({
      ...scene,
      yaw: viewer.getYaw(),
      pitch: viewer.getPitch(),
      hfov: viewer.getHfov(),
    }));
    setOkMsg("מבט התחלתי נשמר לסצנה זו");
  };

  const removeHotspot = (hsId) => {
    if (!activeSceneId) return;
    applySceneUpdate(activeSceneId, (scene) => ({
      ...scene,
      hotSpots: (scene.hotSpots || []).filter((h) => h.id !== hsId),
    }));
  };

  const renameScene = (sceneId, title) => {
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id === sceneId) return { ...s, title };
        return {
          ...s,
          hotSpots: (s.hotSpots || []).map((h) =>
            h.targetSceneId === sceneId ? { ...h, text: title } : h
          ),
        };
      })
    );
    setDirty(true);
  };

  const save = async () => {
    if (!jobId || scenes.length === 0) return;
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(`/api/pipeline/jobs/${jobId}/tour`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes, firstSceneId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "שמירה נכשלה");
      setTourUrl(data.tourUrl);
      setDirty(false);
      setOkMsg(`נשמר · ${data.sceneCount} סצנות · ${data.linkCount} קישורים`);
    } catch (err) {
      setError(err.message || "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const otherScenes = scenes.filter((s) => s.id !== activeSceneId);
  const eightKWarning =
    panoMeta &&
    (panoMeta.width >= 7500 || (textureLimit && panoMeta.width > textureLimit));

  return (
    <div>
      <h1 className="visio-admin-page-title">עורך סיור 360°</h1>
      <p style={{ color: ADMIN.muted, fontSize: 13, marginTop: -16, marginBottom: 24, lineHeight: 1.7, maxWidth: 640 }}>
        בחר job עם פנורמות X4 → תן שמות לחדרים → לחץ להוספת חצים בין חדרים → שמור.
        הסיור הציבורי מתעדכן באותם נתיבי Blob (ללא התחברות).
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 260px" }}>
          <label className="visio-admin-label">Job</label>
          <select
            className="visio-admin-input"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            dir="rtl"
          >
            <option value="">— בחר —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {jobLabel(j)}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="visio-admin-btn-ghost" onClick={() => loadJobs()}>
          <RefreshCw size={14} />
          רענון רשימה
        </button>
        <button
          type="button"
          className="visio-admin-btn-primary"
          onClick={save}
          disabled={saving || !scenes.length || !dirty}
          style={{ opacity: saving || !scenes.length || !dirty ? 0.5 : 1 }}
        >
          {saving ? <Loader2 size={14} className="visio-spin" /> : <Save size={14} />}
          {" "}שמור סיור
        </button>
        {tourUrl && (
          <a
            href={tourUrl}
            target="_blank"
            rel="noreferrer"
            className="visio-admin-btn-ghost"
            style={{ color: ADMIN.gold, textDecoration: "none" }}
          >
            <ExternalLink size={14} />
            פתח סיור ציבורי
          </a>
        )}
      </div>

      {error && <div className="visio-admin-error" style={{ marginBottom: 16 }}>{error}</div>}
      {okMsg && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--visio-success-bg)", border: "1px solid var(--visio-success-border)", color: ADMIN.success, fontSize: 12 }}>
          {okMsg}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: ADMIN.muted, padding: 24 }}>
          <Loader2 size={20} className="visio-spin" color={ADMIN.gold} />
          טוען סיור…
        </div>
      )}

      {!loading && scenes.length > 0 && (
        <div className="visio-tour-editor-grid">
          <aside style={{ ...glassPanel, padding: 16 }}>
            <div className="visio-admin-section-title" style={{ marginBottom: 12 }}>חדרים</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scenes.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => setActiveSceneId(scene.id)}
                  style={{
                    textAlign: "right",
                    padding: "10px 12px",
                    background: scene.id === activeSceneId ? "var(--visio-gold-wash)" : "var(--visio-input-bg)",
                    border: `1px solid ${scene.id === activeSceneId ? "var(--visio-gold-border-strong)" : "var(--visio-border-subtle)"}`,
                    color: ADMIN.text,
                    cursor: "pointer",
                    borderRadius: 2,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{scene.title || scene.id}</div>
                  <div style={{ fontSize: 10, color: ADMIN.muted, marginTop: 4 }}>
                    {(scene.hotSpots || []).length} חצים
                    {firstSceneId === scene.id ? " · התחלה" : ""}
                  </div>
                </button>
              ))}
            </div>

            {activeScene && (
              <div style={{ marginTop: 16 }}>
                <label className="visio-admin-label">שם החדר</label>
                <input
                  className="visio-admin-input"
                  value={activeScene.title}
                  onChange={(e) => renameScene(activeScene.id, e.target.value)}
                  dir="rtl"
                />
                <label className="visio-admin-label" style={{ marginTop: 12 }}>סצנת פתיחה של הסיור</label>
                <select
                  className="visio-admin-input"
                  value={firstSceneId}
                  onChange={(e) => {
                    setFirstSceneId(e.target.value);
                    setDirty(true);
                  }}
                >
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>{s.title || s.id}</option>
                  ))}
                </select>
              </div>
            )}
          </aside>

          <section style={{ ...glassPanel, padding: 0, overflow: "hidden", minHeight: 420 }}>
            <div
              ref={containerRef}
              className="visio-tour-editor-viewer"
              style={{ width: "100%", height: 420, background: "#0a0a0a" }}
            />
            {!viewerReady && activeScene && (
              <div style={{ position: "relative", marginTop: -420, height: 420, display: "flex", alignItems: "center", justifyContent: "center", color: ADMIN.muted, pointerEvents: "none" }}>
                <Loader2 size={22} className="visio-spin" color={ADMIN.gold} />
              </div>
            )}

            <div style={{ padding: 16, borderTop: "1px solid var(--visio-border-subtle)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <div style={{ flex: "1 1 180px" }}>
                  <label className="visio-admin-label">יעד לחץ הבא</label>
                  <select
                    className="visio-admin-input"
                    value={pendingTarget}
                    onChange={(e) => setPendingTarget(e.target.value)}
                    disabled={otherScenes.length === 0}
                  >
                    <option value="">— בחר חדר יעד —</option>
                    {otherScenes.map((s) => (
                      <option key={s.id} value={s.id}>{s.title || s.id}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="visio-admin-btn-primary"
                  style={{
                    marginTop: 18,
                    background: placeMode
                      ? "linear-gradient(135deg, #60b0f0, #3a7aad)"
                      : undefined,
                    opacity: !pendingTarget ? 0.45 : 1,
                  }}
                  disabled={!pendingTarget || !viewerReady}
                  onClick={() => setPlaceMode((v) => !v)}
                >
                  <MousePointerClick size={14} />
                  {placeMode ? "לחץ על התמונה…" : "הוסף חץ"}
                </button>
                <button
                  type="button"
                  className="visio-admin-btn-ghost"
                  style={{ marginTop: 18, color: ADMIN.text }}
                  disabled={!viewerReady}
                  onClick={captureStartView}
                >
                  <Eye size={14} />
                  קבע מבט התחלתי
                </button>
              </div>

              {placeMode && (
                <div style={{ fontSize: 12, color: ADMIN.accent, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={14} />
                  מצב מיקום פעיל — לחץ על הכיוון בדלת / מעבר בחדר
                </div>
              )}

              <div className="visio-admin-section-title" style={{ fontSize: 13, marginBottom: 8 }}>חצים בחדר זה</div>
              {(activeScene?.hotSpots || []).length === 0 ? (
                <div style={{ fontSize: 12, color: ADMIN.muted }}>אין חצים עדיין</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(activeScene.hotSpots || []).map((h) => (
                    <div
                      key={h.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        gap: 8,
                        alignItems: "center",
                        padding: "8px 10px",
                        background: "var(--visio-input-bg)",
                        border: "1px solid var(--visio-border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: 12, color: ADMIN.text }}>
                        → {scenes.find((s) => s.id === h.targetSceneId)?.title || h.targetSceneId}
                        <span style={{ color: ADMIN.muted, marginInlineStart: 8 }} dir="ltr">
                          yaw {h.yaw.toFixed(1)}° · pitch {h.pitch.toFixed(1)}°
                        </span>
                      </div>
                      <select
                        className="visio-admin-input"
                        style={{ padding: "6px 8px", fontSize: 12 }}
                        value={h.targetSceneId}
                        onChange={(e) => {
                          const targetId = e.target.value;
                          const title = scenes.find((s) => s.id === targetId)?.title || "";
                          applySceneUpdate(activeSceneId, (scene) => ({
                            ...scene,
                            hotSpots: scene.hotSpots.map((x) =>
                              x.id === h.id
                                ? { ...x, targetSceneId: targetId, text: title }
                                : x
                            ),
                          }));
                        }}
                      >
                        {otherScenes.map((s) => (
                          <option key={s.id} value={s.id}>{s.title || s.id}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="visio-admin-btn-ghost"
                        style={{ color: ADMIN.error, padding: 8 }}
                        onClick={() => removeHotspot(h.id)}
                        aria-label="מחק חץ"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside style={{ ...glassPanel, padding: 16 }}>
            <div className="visio-admin-section-title" style={{ marginBottom: 12 }}>אבחון 8K</div>
            <div style={{ fontSize: 12, color: ADMIN.muted, lineHeight: 1.8 }}>
              <div>MAX_TEXTURE_SIZE: <span dir="ltr" style={{ color: ADMIN.text }}>{textureLimit ?? "—"}</span></div>
              {panoMeta ? (
                <>
                  <div>
                    רזולוציה:{" "}
                    <span dir="ltr" style={{ color: ADMIN.text }}>
                      {panoMeta.width}×{panoMeta.height}
                    </span>
                  </div>
                  <div>
                    גודל קובץ:{" "}
                    <span dir="ltr" style={{ color: ADMIN.text }}>
                      {panoMeta.bytes != null
                        ? `${(panoMeta.bytes / (1024 * 1024)).toFixed(2)} MB`
                        : "לא זמין (CORS HEAD)"}
                    </span>
                  </div>
                </>
              ) : (
                <div>טוען מטא־דאטה של הפנורמה…</div>
              )}
            </div>
            {eightKWarning && (
              <div style={{ marginTop: 12, padding: 10, border: "1px solid var(--visio-error-border)", background: "var(--visio-error-bg)", color: ADMIN.error, fontSize: 12, lineHeight: 1.6, display: "flex", gap: 8 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  פנורמה ~8K — ייתכן עומס על GPU במובייל ישן (מגבלת טקסטורה {textureLimit || "?"}px).
                  לא משנים גודל אוטומטית. אם הטעינה נכשלת או איטית מאוד בטלפון — ראו המלצת downscale/multires אחרי הבדיקה.
                </span>
              </div>
            )}
            <p style={{ marginTop: 14, fontSize: 11, color: ADMIN.muted, lineHeight: 1.7 }}>
              סיווג: קבצים עם יחס ~2:1 או שם Insta360/360 מסווגים כפנורמה equirectangular.
              X4 ב־8192×4096 עובר את בדיקת היחס.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
