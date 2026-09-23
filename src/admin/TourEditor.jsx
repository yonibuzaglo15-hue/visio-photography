"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  MapPin,
  MousePointerClick,
  Eye,
  EyeOff,
  Save,
  Trash2,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { ADMIN, glassPanel } from "./theme.js";
import {
  analyzeTourGraph,
  buildPannellumConfig,
} from "../../lib/tour/pannellum-config.js";
import {
  FLOOR_NAV_CSS,
  installFloorNav,
  prepareFloorHotspots,
} from "../../lib/tour/floor-nav.js";
import FloorPlanPanel from "./FloorPlanPanel.jsx";
import {
  DEFAULT_MAX_LINK_METERS,
  DEFAULT_SHORT_SIDE_METERS,
} from "../../lib/tour/floor-plan.js";

const PANNELLUM_CSS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
const PANNELLUM_JS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";

let pannellumLoadPromise = null;
let floorCssInjected = false;

function ensureFloorCss() {
  if (typeof document === "undefined" || floorCssInjected) return;
  if (!document.getElementById("visio-floor-nav-css")) {
    const style = document.createElement("style");
    style.id = "visio-floor-nav-css";
    style.textContent = FLOOR_NAV_CSS;
    document.head.appendChild(style);
  }
  floorCssInjected = true;
}

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
  const [floorPlans, setFloorPlans] = useState([]);
  const [calibHint, setCalibHint] = useState("");
  const [calibPreview, setCalibPreview] = useState(null);
  const [floorPlanMeta, setFloorPlanMeta] = useState({
    maxLinkMeters: DEFAULT_MAX_LINK_METERS,
    metersPerNorm: DEFAULT_SHORT_SIDE_METERS,
    cameraHeightM: 1.6,
    maxNeighbors: 3,
    scaleCalibrated: false,
    sameFloorOnly: true,
    deletedLinks: [],
    addedLinks: [],
  });

  const viewerRef = useRef(null);
  const floorNavRef = useRef(null);
  const walkRef = useRef(null);
  const containerRef = useRef(null);
  const placeModeRef = useRef(false);
  const pendingTargetRef = useRef("");
  const scenesRef = useRef(scenes);
  const activeSceneIdRef = useRef(activeSceneId);
  const skipRemountRef = useRef(false);

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
    ensureFloorCss();
    const onReadYaw = () => {
      try {
        if (viewerRef.current) {
          window.__visioEditorYaw = viewerRef.current.getYaw();
        }
      } catch {
        /* ignore */
      }
    };
    const onArmPick = (ev) => {
      window.__visioPanoPick = ev.detail || null;
      setCalibHint(
        ev.detail?.label
          ? `לחץ בפנורמה על הפתח ל־${ev.detail.label}`
          : "לחץ בפנורמה על הפתח"
      );
    };
    const onPreview = (ev) => {
      setCalibPreview(ev.detail || null);
    };
    window.addEventListener("visio-read-yaw", onReadYaw);
    window.addEventListener("visio-arm-pano-pick", onArmPick);
    window.addEventListener("visio-calib-preview", onPreview);
    return () => {
      window.removeEventListener("visio-read-yaw", onReadYaw);
      window.removeEventListener("visio-arm-pano-pick", onArmPick);
      window.removeEventListener("visio-calib-preview", onPreview);
    };
  }, []);

  const graphStats = useMemo(
    () => analyzeTourGraph(scenes, firstSceneId),
    [scenes, firstSceneId]
  );
  const statsById = useMemo(() => {
    const m = new Map();
    for (const g of graphStats) m.set(g.id, g);
    return m;
  }, [graphStats]);

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
    if (floorNavRef.current) {
      try {
        floorNavRef.current.destroy();
      } catch {
        /* ignore */
      }
      floorNavRef.current = null;
    }
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

      const list = (data.scenes || []).map((s) => ({
        ...s,
        hidden: Boolean(s.hidden),
        hotSpots: s.hotSpots || [],
      }));
      setScenes(list);
      setFloorPlans(Array.isArray(data.floorPlans) ? data.floorPlans : []);
      setFloorPlanMeta(
        data.floorPlanMeta && typeof data.floorPlanMeta === "object"
          ? data.floorPlanMeta
          : {
              maxLinkMeters: DEFAULT_MAX_LINK_METERS,
              metersPerNorm: DEFAULT_SHORT_SIDE_METERS,
              cameraHeightM: 1.6,
              maxNeighbors: 3,
              scaleCalibrated: false,
              sameFloorOnly: true,
              deletedLinks: [],
              addedLinks: [],
            }
      );
      setFirstSceneId(data.firstSceneId || list.find((s) => !s.hidden)?.id || list[0]?.id || "");
      setActiveSceneId(list.find((s) => !s.hidden)?.id || list[0]?.id || "");
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

  const placeHotspot = useCallback(
    (pitch, yaw) => {
      const targetId = pendingTargetRef.current;
      if (!targetId) return;
      const sceneId = activeSceneIdRef.current;
      const target = scenesRef.current.find((s) => s.id === targetId);
      const origin = scenesRef.current.find((s) => s.id === sceneId);

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
      setPendingTarget("");

      const targetTitle = target?.title || "B";
      const originTitle = origin?.title || "A";
      const addBack = window.confirm(
        `הוסף גם נקודה חזרה מ-${targetTitle} ל-${originTitle}?`
      );
      if (addBack) {
        activeSceneIdRef.current = targetId;
        setActiveSceneId(targetId);
        setPendingTarget(sceneId);
        setPlaceMode(true);
        setOkMsg(`לחץ על הרצפה ב-${targetTitle} במקום שבו רואים את ${originTitle}`);
      } else {
        setOkMsg("נקודת ניווט נוספה — שמור כדי לפרסם");
      }
    },
    [applySceneUpdate]
  );

  const mountViewer = useCallback(async () => {
    if (!scenesRef.current.length || !containerRef.current) return;

    destroyViewer();
    setViewerReady(false);
    ensureFloorCss();

    try {
      const pannellum = await loadPannellum();
      if (!containerRef.current) return;

      const startId =
        activeSceneIdRef.current ||
        scenesRef.current.find((s) => !s.hidden)?.id ||
        scenesRef.current[0]?.id;

      const config = buildPannellumConfig({
        scenes: scenesRef.current,
        firstSceneId: startId,
        includeHidden: true,
      });
      if (config.default) {
        config.default.firstScene = startId;
        config.default.sceneFadeDuration = 400;
        config.default.hotSpotDebug = false;
      }

      const walkBridge = { current: null };
      prepareFloorHotspots(config, {
        cssClass: "visio-editor-hotspot",
        onHover: (sceneId) => {
          if (floorNavRef.current?.preloadScene) {
            floorNavRef.current.preloadScene(sceneId);
          }
        },
        onClick: (hs) => {
          if (placeModeRef.current) return;
          if (typeof walkBridge.current === "function") walkBridge.current(hs);
        },
      });

      containerRef.current.innerHTML = "";
      const viewer = pannellum.viewer(containerRef.current, config);

      const nav = installFloorNav(viewer, config, {
        walkRef: walkBridge,
        isPlaceMode: () => placeModeRef.current,
        onFloorPlace: (pitch, yaw) => placeHotspot(pitch, yaw),
        onSceneChange: (sceneId) => {
          if (sceneId && sceneId !== activeSceneIdRef.current) {
            skipRemountRef.current = true;
            setActiveSceneId(sceneId);
          }
        },
      });

      walkRef.current = walkBridge;
      floorNavRef.current = nav;
      viewerRef.current = viewer;
      setViewerReady(true);
    } catch (err) {
      setError(err.message || "שגיאה בטעינת הצופה");
    }
  }, [destroyViewer, placeHotspot]);

  const tourSignature = scenes
    .map(
      (s) =>
        `${s.id}:${s.hidden ? 1 : 0}:${s.panoramaUrl}:${(s.hotSpots || [])
          .map((h) => `${h.id}:${h.targetSceneId}:${Number(h.yaw).toFixed(2)}:${Number(h.pitch).toFixed(2)}`)
          .join(",")}`
    )
    .join("|");

  useEffect(() => {
    if (!scenes.length) return undefined;
    if (skipRemountRef.current) {
      skipRemountRef.current = false;
      return undefined;
    }
    mountViewer();
    return () => destroyViewer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount on tour graph identity
  }, [jobId, tourSignature]);

  const selectScene = (sceneId) => {
    setActiveSceneId(sceneId);
    const viewer = viewerRef.current;
    if (viewer && typeof viewer.loadScene === "function") {
      try {
        const sc = scenesRef.current.find((s) => s.id === sceneId);
        if (sc && viewer.getConfig()?.scenes?.[sceneId]) {
          skipRemountRef.current = true;
          viewer.loadScene(
            sceneId,
            sc.pitch ?? 0,
            sc.yaw ?? 0,
            sc.hfov ?? 100
          );
          return;
        }
      } catch {
        /* fall through to remount via signature if needed */
      }
    }
  };

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

  const toggleHidden = (sceneId) => {
    applySceneUpdate(sceneId, (scene) => ({
      ...scene,
      hidden: !scene.hidden,
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
        body: JSON.stringify({ scenes, firstSceneId, floorPlans, floorPlanMeta }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "שמירה נכשלה");
      setTourUrl(data.tourUrl);
      setDirty(false);
      setOkMsg(`נשמר · ${data.sceneCount} סצנות גלויות · ${data.linkCount} קישורים`);
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
      <p style={{ color: ADMIN.muted, fontSize: 13, marginTop: -16, marginBottom: 24, lineHeight: 1.7, maxWidth: 720 }}>
        העלה תוכנית קומה → גרור סצנות לנקודות → כייל כיוון → חשב קישורים אוטומטית.
        עריכה ידנית של דיסקיות נשארת כגיבוי.
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
        {jobId && (
          <a
            href={`/tour/${jobId}`}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflowY: "auto" }}>
              {scenes.map((scene) => {
                const g = statsById.get(scene.id);
                const pointCount = (scene.hotSpots || []).length;
                return (
                  <div
                    key={scene.id}
                    style={{
                      padding: "10px 12px",
                      background: scene.id === activeSceneId ? "var(--visio-gold-wash)" : "var(--visio-input-bg)",
                      border: `1px solid ${scene.id === activeSceneId ? "var(--visio-gold-border-strong)" : "var(--visio-border-subtle)"}`,
                      borderRadius: 2,
                      opacity: scene.hidden ? 0.55 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => selectScene(scene.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "right",
                        background: "none",
                        border: "none",
                        color: ADMIN.text,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {scene.title || scene.id}
                        {scene.hidden ? " · מוסתר" : ""}
                      </div>
                      <div style={{ fontSize: 10, color: ADMIN.muted, marginTop: 4 }}>
                        {pointCount} נקודות
                        {firstSceneId === scene.id ? " · התחלה" : ""}
                        {g?.isDeadEnd && !scene.hidden ? " · ללא יציאה" : ""}
                        {g?.isUnreachable && !scene.hidden ? " · לא נגיש" : ""}
                      </div>
                    </button>
                    {(g?.isDeadEnd || g?.isUnreachable) && !scene.hidden && (
                      <div style={{ marginTop: 6, fontSize: 10, color: ADMIN.error, display: "flex", alignItems: "center", gap: 4 }}>
                        <AlertTriangle size={11} />
                        {g.isDeadEnd && g.isUnreachable
                          ? "מבוי סתום ולא נגיש"
                          : g.isDeadEnd
                            ? "אין נקודות יציאה"
                            : "שום סצנה לא מקשרת לכאן"}
                      </div>
                    )}
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="visio-admin-btn-ghost"
                        style={{ padding: "4px 8px", fontSize: 11, flex: 1 }}
                        onClick={() => toggleHidden(scene.id)}
                        title={scene.hidden ? "הצג בסיור" : "הסתר מהסיור"}
                      >
                        {scene.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
                        {scene.hidden ? " הצג" : " הסתר"}
                      </button>
                    </div>
                  </div>
                );
              })}
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
                  {scenes.filter((s) => !s.hidden).map((s) => (
                    <option key={s.id} value={s.id}>{s.title || s.id}</option>
                  ))}
                </select>
              </div>
            )}
          </aside>

          <section style={{ ...glassPanel, padding: 0, overflow: "hidden", minHeight: 420, position: "relative" }}>
            <div
              ref={containerRef}
              className="visio-tour-editor-viewer"
              style={{ width: "100%", height: 420, background: "#0a0a0a" }}
              onClick={(e) => {
                const pick = window.__visioPanoPick;
                const viewer = viewerRef.current;
                if (!pick || !viewer) return;
                try {
                  const coords = viewer.mouseEventToCoords(e.nativeEvent || e);
                  if (!coords) return;
                  const yaw = coords[1];
                  window.__visioPanoPick = null;
                  setCalibHint("");
                  window.dispatchEvent(
                    new CustomEvent("visio-pano-pick-done", {
                      detail: {
                        fromId: pick.fromId,
                        toId: pick.toId,
                        yaw,
                        pitch: coords[0],
                      },
                    })
                  );
                } catch {
                  /* ignore */
                }
              }}
            />
            {calibHint && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 30,
                  background: "rgba(201,168,76,0.95)",
                  color: "#0a0a0a",
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 2,
                  pointerEvents: "none",
                }}
              >
                {calibHint}
              </div>
            )}
            {calibPreview && viewerReady && (
              <CalibPreviewOverlay viewerRef={viewerRef} preview={calibPreview} />
            )}
            {!viewerReady && activeScene && (
              <div style={{ position: "relative", marginTop: -420, height: 420, display: "flex", alignItems: "center", justifyContent: "center", color: ADMIN.muted, pointerEvents: "none" }}>
                <Loader2 size={22} className="visio-spin" color={ADMIN.gold} />
              </div>
            )}

            <div style={{ padding: 16, borderTop: "1px solid var(--visio-border-subtle)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <div style={{ flex: "1 1 180px" }}>
                  <label className="visio-admin-label">יעד לנקודה הבאה</label>
                  <select
                    className="visio-admin-input"
                    value={pendingTarget}
                    onChange={(e) => setPendingTarget(e.target.value)}
                    disabled={otherScenes.length === 0}
                  >
                    <option value="">— בחר חדר יעד —</option>
                    {otherScenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title || s.id}{s.hidden ? " (מוסתר)" : ""}
                      </option>
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
                  {placeMode ? "לחץ על הרצפה…" : "הוסף נקודה"}
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
                  מצב מיקום — לחץ על הרצפה במקום הצילום הבא (לא על משקוף הדלת)
                </div>
              )}

              <div className="visio-admin-section-title" style={{ fontSize: 13, marginBottom: 8 }}>נקודות בחדר זה</div>
              {(activeScene?.hotSpots || []).length === 0 ? (
                <div style={{ fontSize: 12, color: ADMIN.muted }}>אין נקודות עדיין</div>
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
                        aria-label="מחק נקודה"
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
                </span>
              </div>
            )}
            <p style={{ marginTop: 14, fontSize: 11, color: ADMIN.muted, lineHeight: 1.7 }}>
              נקודות ניווט = דיסקיות רצפה. קישור דו־כיווני קובע את כיוון ההגעה אחרי מעבר.
            </p>
          </aside>
        </div>
      )}

      {!loading && scenes.length > 0 && (
        <FloorPlanPanel
          jobId={jobId}
          scenes={scenes}
          floorPlans={floorPlans}
          floorPlanMeta={floorPlanMeta}
          activeSceneId={activeSceneId}
          onScenesChange={(next) => {
            setScenes(next);
            setDirty(true);
          }}
          onFloorPlansChange={setFloorPlans}
          onFloorPlanMetaChange={setFloorPlanMeta}
          onSelectScene={selectScene}
          onDirty={() => setDirty(true)}
        />
      )}
    </div>
  );
}

function CalibPreviewOverlay({ viewerRef, preview }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const viewer = viewerRef.current;
      if (viewer && preview && Number.isFinite(preview.yaw)) {
        try {
          const screen = viewer.coordsToScreen(preview.pitch ?? -25, preview.yaw);
          if (screen && Number.isFinite(screen.x) && Number.isFinite(screen.y)) {
            setPos({ x: screen.x, y: screen.y });
          } else {
            setPos(null);
          }
        } catch {
          setPos(null);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewerRef, preview]);

  if (!pos || !preview) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        transform: "translate(-50%, -120%)",
        zIndex: 25,
        pointerEvents: "none",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 0,
          height: 0,
          margin: "0 auto 4px",
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderBottom: "14px solid rgba(201,168,76,0.95)",
        }}
      />
      <div
        style={{
          background: "rgba(10,10,10,0.85)",
          color: "#f5f5f5",
          padding: "4px 8px",
          fontSize: 12,
          borderRadius: 2,
          whiteSpace: "nowrap",
        }}
      >
        {preview.label || "חדר"}
      </div>
    </div>
  );
}
