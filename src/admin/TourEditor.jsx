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
import { analyzeTourGraph, buildTourConfig } from "../../lib/tour/tour-config.js";
import { createPsvTourViewer } from "../../lib/tour/create-psv-viewer.js";
import FloorPlanPanel from "./FloorPlanPanel.jsx";
import { friendlyRoomLabel } from "../../lib/tour/room-label.js";
import { discsFromYawCalibration } from "../../lib/tour/geo-nav.js";

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
  /** One-click yaw: click doorway toward this neighbour to solve mapYawOffset. */
  const [yawCalibrateTarget, setYawCalibrateTarget] = useState("");
  const [geoLinks, setGeoLinks] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [textureLimit, setTextureLimit] = useState(null);
  const [panoMeta, setPanoMeta] = useState(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [floorPlans, setFloorPlans] = useState([]);
  /** Saved version this editor loaded; the server rejects saves on top of a newer one. */
  const [tourVersion, setTourVersion] = useState(null);
  const [conflict, setConflict] = useState(false);

  const viewerRef = useRef(null);
  const psvApiRef = useRef(null);
  const containerRef = useRef(null);
  const placeModeRef = useRef(false);
  const pendingTargetRef = useRef("");
  const yawCalibrateTargetRef = useRef("");
  const geoLinksRef = useRef(geoLinks);
  const scenesRef = useRef(scenes);
  const activeSceneIdRef = useRef(activeSceneId);
  const floorPlansRef = useRef(floorPlans);

  useEffect(() => {
    placeModeRef.current = placeMode;
  }, [placeMode]);
  useEffect(() => {
    pendingTargetRef.current = pendingTarget;
  }, [pendingTarget]);
  useEffect(() => {
    yawCalibrateTargetRef.current = yawCalibrateTarget;
  }, [yawCalibrateTarget]);
  useEffect(() => {
    geoLinksRef.current = geoLinks;
  }, [geoLinks]);
  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);
  useEffect(() => {
    activeSceneIdRef.current = activeSceneId;
  }, [activeSceneId]);
  useEffect(() => {
    floorPlansRef.current = floorPlans;
  }, [floorPlans]);
  // Never lose unsaved placements / hotspots to a reload or tab close.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    setTextureLimit(probeTextureLimit());
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
      // Functional update: a slow response must not replace a job the user already chose.
      if (withPanos[0]) setJobId((current) => current || withPanos[0].id);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("job");
      if (q) setJobId(q);
    } catch {
      /* ignore */
    }
  }, []);

  const mountTokenRef = useRef(0);
  /** Scene ids this editor asked the viewer to open (not user navigation). */
  const requestedNodesRef = useRef(new Set());
  const destroyViewer = useCallback(() => {
    if (psvApiRef.current) {
      try {
        psvApiRef.current.destroy();
      } catch {
        /* ignore */
      }
      psvApiRef.current = null;
    }
    viewerRef.current = null;
    setViewerReady(false);
  }, []);

  const loadTour = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setError("");
    setOkMsg("");
    setPlaceMode(false);
    setDirty(false);
    setConflict(false);
    setGeoLinks([]);
    setYawCalibrateTarget("");
    destroyViewer();

    try {
      const res = await fetch(`/api/pipeline/jobs/${id}/tour`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "טעינה נכשלה");

      if (data.provider === "kuula") {
        setError("הסיור הזה ב-Kuula — עורך הקישורים תומך רק בסיורי VISIO (Photo Sphere Viewer).");
        setScenes([]);
        setTourUrl(data.tourUrl);
        return;
      }

      const list = (data.scenes || []).map((s, i) => ({
        ...s,
        title: friendlyRoomLabel(s, i + 1),
        hidden: Boolean(s.hidden),
        hotSpots: s.hotSpots || [],
      }));
      setScenes(list);
      setFloorPlans(Array.isArray(data.floorPlans) ? data.floorPlans : []);
      setTourVersion(data.version || null);
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
      const calibrateTo = yawCalibrateTargetRef.current;
      const sceneId = activeSceneIdRef.current;
      const list = scenesRef.current;
      const labelOf = (id) => {
        const i = list.findIndex((s) => s.id === id);
        return friendlyRoomLabel(list[i] || { id }, i + 1);
      };

      // One-click yaw: solve offset from the doorway click, write discs for every
      // accepted geometric neighbour of this scene.
      if (calibrateTo) {
        const from = list.find((s) => s.id === sceneId);
        if (
          !from ||
          !Number.isFinite(Number(from.mapX)) ||
          !Number.isFinite(Number(from.mapY))
        ) {
          setError("מקמו את הסצנה על התוכנית לפני כיול כיוון");
          return;
        }
        const neighbourIds = new Set();
        for (const g of geoLinksRef.current || []) {
          if (g.a === sceneId) neighbourIds.add(g.b);
          if (g.b === sceneId) neighbourIds.add(g.a);
        }
        neighbourIds.add(calibrateTo);
        const neighbours = [...neighbourIds]
          .map((id) => {
            const s = list.find((x) => x.id === id);
            if (!s || !Number.isFinite(Number(s.mapX)) || !Number.isFinite(Number(s.mapY))) {
              return null;
            }
            return { id, x: Number(s.mapX), y: Number(s.mapY) };
          })
          .filter(Boolean);
        const discs = discsFromYawCalibration({
          fromId: sceneId,
          fromPos: { x: Number(from.mapX), y: Number(from.mapY) },
          neighbours,
          clickYaw: yaw,
          clickPitch: pitch,
          towardsId: calibrateTo,
        });
        if (!discs.length) {
          setError("לא ניתן לחשב כיוון — בדקו שיש קישור מאושר לשכן");
          return;
        }
        setScenes((prev) =>
          prev.map((s) => {
            if (s.id !== sceneId) return s;
            const keep = (s.hotSpots || []).filter(
              (h) => !discs.some((d) => d.targetSceneId === h.targetSceneId)
            );
            return {
              ...s,
              mapYawOffset: true,
              hotSpots: [
                ...keep,
                ...discs.map((d) => ({
                  id: newHotspotId(),
                  pitch: d.pitch,
                  yaw: d.yaw,
                  targetSceneId: d.targetSceneId,
                  source: "geo",
                })),
              ],
            };
          })
        );
        setDirty(true);
        setYawCalibrateTarget("");
        setPlaceMode(false);
        setPendingTarget("");
        setOkMsg(
          `כיול כיוון ל־${labelOf(sceneId)}: ${discs.length} דיסקיות מהגיאומטריה — שמור כדי לפרסם`
        );
        return;
      }

      const targetId = pendingTargetRef.current;
      if (!targetId) return;
      const target = list.find((s) => s.id === targetId);
      // Store exactly the clicked yaw/pitch — never recompute from the plan.
      const exactPitch = Number(pitch);
      const exactYaw = Number(yaw);
      // Provisional way back (+180°) only when the target room has none yet; a ring
      // placed by hand in the target room is never overwritten from here.
      const needsBack = !(target?.hotSpots || []).some((h) => h.targetSceneId === sceneId);
      let backYaw = exactYaw + 180;
      while (backYaw > 180) backYaw -= 360;
      while (backYaw < -180) backYaw += 360;

      setScenes((prev) =>
        prev.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              hotSpots: [
                ...(s.hotSpots || []).filter((h) => h.targetSceneId !== targetId),
                { id: newHotspotId(), pitch: exactPitch, yaw: exactYaw, targetSceneId: targetId },
              ],
            };
          }
          if (s.id === targetId && needsBack) {
            return {
              ...s,
              hotSpots: [
                ...(s.hotSpots || []),
                { id: newHotspotId(), pitch: exactPitch, yaw: backYaw, targetSceneId: sceneId },
              ],
            };
          }
          return s;
        })
      );
      setDirty(true);
      setPlaceMode(false);
      setPendingTarget("");
      setOkMsg(
        needsBack
          ? `נקודה: ${labelOf(sceneId)} → ${labelOf(targetId)} (ונקודת חזרה זמנית בחדר היעד — מקם אותה ידנית לדיוק) — שמור כדי לפרסם`
          : `נקודה: ${labelOf(sceneId)} → ${labelOf(targetId)} — שמור כדי לפרסם`
      );
    },
    []
  );

  const mountViewer = useCallback(async () => {
    if (!scenesRef.current.length || !containerRef.current) return;

    const token = ++mountTokenRef.current;
    destroyViewer();
    setViewerReady(false);

    try {
      const startId =
        activeSceneIdRef.current ||
        scenesRef.current.find((s) => !s.hidden)?.id ||
        scenesRef.current[0]?.id;

      const config = buildTourConfig({
        scenes: scenesRef.current,
        firstSceneId: startId,
        includeHidden: true,
        floorPlans: floorPlansRef.current,
      });
      if (config.default) {
        config.default.firstScene = startId;
      }

      containerRef.current.innerHTML = "";
      const api = await createPsvTourViewer(containerRef.current, config, {
        startNodeId: startId,
        includeHidden: true,
        enableMap: true,
        isCancelled: () => token !== mountTokenRef.current,
        isPlaceMode: () => placeModeRef.current || Boolean(yawCalibrateTargetRef.current),
        onPlaceClick: ({ pitch, yaw }) => {
          placeHotspot(pitch, yaw);
        },
        onNodeChange: (node) => {
          // Scene switches the editor requested itself are already applied; only
          // follow navigation done inside the panorama (clicking a ring).
          if (node?.id && requestedNodesRef.current.delete(node.id)) return;
          if (node?.id && node.id !== activeSceneIdRef.current) {
            setActiveSceneId(node.id);
          }
        },
      });
      if (!api) return;
      if (token !== mountTokenRef.current) {
        api.destroy();
        return;
      }

      psvApiRef.current = api;
      viewerRef.current = api.viewer;
      if (typeof window !== "undefined") {
        window.__visioEditorViewer = api.viewer;
        window.__visioEditorPlaceHotspot = (pitch, yaw, targetId) => {
          if (targetId) {
            pendingTargetRef.current = targetId;
            setPendingTarget(targetId);
          }
          placeHotspot(pitch, yaw);
        };
      }
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
    mountViewer();
    return () => {
      mountTokenRef.current++;
      destroyViewer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount on tour graph identity
  }, [jobId, tourSignature]);

  const selectScene = (sceneId) => {
    setActiveSceneId(sceneId);
    activeSceneIdRef.current = sceneId;
    const api = psvApiRef.current;
    if (api?.setCurrentNode) {
      try {
        if (api.virtualTour?.getCurrentNode?.()?.id !== sceneId) {
          requestedNodesRef.current.add(sceneId);
        }
        api.setCurrentNode(sceneId);
        return;
      } catch {
        /* fall through to remount */
      }
    }
  };

  const captureStartView = () => {
    const api = psvApiRef.current;
    if (!api || !activeSceneId) return;
    const { yaw, pitch } = api.getPositionDegrees();
    applySceneUpdate(activeSceneId, (scene) => ({
      ...scene,
      yaw,
      pitch,
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
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, title } : s)));
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
        body: JSON.stringify({ scenes, firstSceneId, floorPlans, baseVersion: tourVersion }),
      });
      const data = await res.json();
      if (data.conflict) setConflict(true);
      if (!data.ok) throw new Error(data.error || "שמירה נכשלה");
      setTourUrl(data.tourUrl);
      setTourVersion(data.version || null);
      setDirty(false);
      setOkMsg(`נשמר · ${data.sceneCount} סצנות גלויות · ${data.linkCount} קישורים`);
    } catch (err) {
      setError(err.message || "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const otherScenes = scenes.filter((s) => s.id !== activeSceneId);
  const geoNeighboursForActive = useMemo(() => {
    const ids = new Set();
    for (const g of geoLinks) {
      if (g.a === activeSceneId) ids.add(g.b);
      if (g.b === activeSceneId) ids.add(g.a);
    }
    return otherScenes.filter((s) => ids.has(s.id));
  }, [geoLinks, activeSceneId, otherScenes]);

  const eightKWarning =
    panoMeta &&
    (panoMeta.width >= 7500 || (textureLimit && panoMeta.width > textureLimit));

  return (
    <div>
      <h1 className="visio-admin-page-title">עורך סיור 360°</h1>
      <p style={{ color: ADMIN.muted, fontSize: 13, marginTop: -16, marginBottom: 24, lineHeight: 1.7, maxWidth: 720 }}>
        מקם כל חדר על תוכנית הקומה, ואז בכל חדר בחר חדר יעד ולחץ על הרצפה בפנורמה
        כדי להוסיף טבעת מעבר. שמור כדי לפרסם.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 260px" }}>
          <label className="visio-admin-label">Job</label>
          <select
            className="visio-admin-input"
            value={jobs.some((j) => j.id === jobId) ? jobId : jobId ? "__custom__" : ""}
            onChange={(e) => {
              if (e.target.value === "__custom__") return;
              if (dirty && !window.confirm("יש שינויים שלא נשמרו. לעבור job ולאבד אותם?")) return;
              setJobId(e.target.value);
            }}
            dir="rtl"
          >
            <option value="">— בחר —</option>
            {jobId && !jobs.some((j) => j.id === jobId) && (
              <option value="__custom__">{jobId}</option>
            )}
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {jobLabel(j)}
              </option>
            ))}
          </select>
          <input
            className="visio-admin-input"
            style={{ marginTop: 8 }}
            placeholder="או הדבק job id"
            value={jobId}
            onChange={(e) => {
              if (dirty && !window.confirm("יש שינויים שלא נשמרו. לעבור job ולאבד אותם?")) return;
              setJobId(e.target.value.trim());
            }}
            dir="ltr"
            data-testid="tour-job-id"
          />
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
          data-testid="tour-save"
          data-version={tourVersion || ""}
          data-dirty={dirty ? "1" : "0"}
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

      {error && (
        <div className="visio-admin-error" style={{ marginBottom: 16 }} data-testid="tour-error">
          {error}
          {conflict && (
            <button
              type="button"
              className="visio-admin-btn-ghost"
              style={{ marginInlineStart: 12 }}
              data-testid="tour-reload-latest"
              onClick={() => loadTour(jobId)}
            >
              <RefreshCw size={12} /> טען את הגרסה האחרונה
            </button>
          )}
        </div>
      )}
      {okMsg && (
        <div data-testid="tour-ok" style={{ marginBottom: 16, padding: "10px 14px", background: "var(--visio-success-bg)", border: "1px solid var(--visio-success-border)", color: ADMIN.success, fontSize: 12 }}>
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
                      data-testid={`tour-scene-${scene.id}`}
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
                        {friendlyRoomLabel(scene)}
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
                        data-testid={`scene-hide-${scene.id}`}
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
                  data-testid="scene-title-input"
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
            />
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
                    data-testid="hotspot-target-select"
                    value={pendingTarget}
                    onChange={(e) => {
                      const id = e.target.value;
                      setPendingTarget(id);
                      setPlaceMode(Boolean(id));
                    }}
                    disabled={otherScenes.length === 0}
                  >
                    <option value="">— בחר חדר יעד —</option>
                    {otherScenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {friendlyRoomLabel(s)}{s.hidden ? " (מוסתר)" : ""}
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
                  data-testid="hotspot-place-btn"
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

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 12,
                  padding: 10,
                  background: "rgba(96,176,240,0.06)",
                  border: "1px solid rgba(96,176,240,0.25)",
                }}
              >
                <div style={{ flex: "1 1 180px" }}>
                  <label className="visio-admin-label">כיול כיוון (לחיצה אחת על הפתח)</label>
                  <select
                    className="visio-admin-input"
                    data-testid="yaw-calibrate-target"
                    value={yawCalibrateTarget}
                    onChange={(e) => {
                      const id = e.target.value;
                      setYawCalibrateTarget(id);
                      if (id) {
                        setPendingTarget("");
                        setPlaceMode(false);
                      }
                    }}
                    disabled={geoNeighboursForActive.length === 0 || !viewerReady}
                  >
                    <option value="">
                      {geoNeighboursForActive.length
                        ? "— בחר שכן מאושר מהתוכנית —"
                        : "— אין קישורים מאושרים לסצנה זו —"}
                    </option>
                    {geoNeighboursForActive.map((s) => (
                      <option key={s.id} value={s.id}>
                        {friendlyRoomLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                {yawCalibrateTarget && (
                  <div
                    data-testid="yaw-calibrate-hint"
                    style={{
                      flex: "1 1 100%",
                      fontSize: 12,
                      color: ADMIN.accent,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <MapPin size={14} />
                    לחצו בפנורמה על הרצפה לכיוון{" "}
                    {friendlyRoomLabel(
                      scenes.find((s) => s.id === yawCalibrateTarget) || {
                        id: yawCalibrateTarget,
                      }
                    )}{" "}
                    — נחשב offset ונציב דיסקיות לכל השכנים המאושרים
                  </div>
                )}
              </div>

              {placeMode && (
                <div style={{ fontSize: 12, color: ADMIN.accent, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={14} />
                  לחץ על הרצפה — הדיסקית תישב בדיוק שם (ללא חישוב מתוכנית)
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
                        → {friendlyRoomLabel(scenes.find((s) => s.id === h.targetSceneId) || { id: h.targetSceneId })}
                        <span style={{ color: ADMIN.muted, marginInlineStart: 8 }} dir="ltr">
                          yaw {Number(h.yaw).toFixed(1)}° · pitch {Number(h.pitch).toFixed(1)}°
                        </span>
                      </div>
                      <select
                        className="visio-admin-input"
                        style={{ padding: "6px 8px", fontSize: 12 }}
                        value={h.targetSceneId}
                        onChange={(e) => {
                          const targetId = e.target.value;
                          applySceneUpdate(activeSceneId, (scene) => ({
                            ...scene,
                            hotSpots: scene.hotSpots.map((x) =>
                              x.id === h.id ? { ...x, targetSceneId: targetId } : x
                            ),
                          }));
                        }}
                      >
                        {otherScenes.map((s) => (
                          <option key={s.id} value={s.id}>{friendlyRoomLabel(s)}</option>
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
          activeSceneId={activeSceneId}
          onScenesChange={(next) => {
            setScenes(next);
            setDirty(true);
          }}
          onFloorPlansChange={setFloorPlans}
          onSelectScene={selectScene}
          onDirty={() => setDirty(true)}
          geoLinks={geoLinks}
          onGeoLinksChange={setGeoLinks}
        />
      )}
    </div>
  );
}
