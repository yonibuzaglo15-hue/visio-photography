"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Link2,
  Loader2,
  Map as MapIcon,
  Navigation,
  Ruler,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ADMIN } from "./theme.js";
import FloorPlanCropModal, { prepareCropSession } from "./FloorPlanCropModal.jsx";
import {
  DEFAULT_MAX_LINK_METERS,
  DEFAULT_MAX_NEIGHBORS,
  DEFAULT_SHORT_SIDE_METERS,
  applyAutoLinksToScenes,
  findCalibrationConflicts,
  friendlyRoomLabel,
  generateAutoLinks,
  hotspotPitch,
  hotspotYaw,
  mapBearing,
  metersPerNormFromLine,
  northOffsetFromDoorway,
  remapScenesToCrop,
  resolveMaxLinkMeters,
  resolveMetersPerNorm,
  summarizeAutoLinks,
} from "../../lib/tour/floor-plan.js";

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Floor-plan driven placement + orientation + auto-link review.
 */
export default function FloorPlanPanel({
  jobId,
  scenes,
  floorPlans,
  floorPlanMeta,
  activeSceneId,
  onScenesChange,
  onFloorPlansChange,
  onFloorPlanMetaChange,
  onSelectScene,
  onDirty,
}) {
  const [activeFloor, setActiveFloor] = useState(
    () => floorPlans[0]?.floor ?? 0
  );
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [cropSession, setCropSession] = useState(null);
  const [linkSummary, setLinkSummary] = useState(null);
  const [mode, setMode] = useState("place"); // place | orient | quickOrient | link | scale
  const [dragSceneId, setDragSceneId] = useState(null);
  const [selectedMapId, setSelectedMapId] = useState(null);
  const [linkFromId, setLinkFromId] = useState(null);
  const [scalePts, setScalePts] = useState([]);
  const [scaleMeters, setScaleMeters] = useState("3");
  const [orientPanoYaw, setOrientPanoYaw] = useState(0);
  const [quickTargetId, setQuickTargetId] = useState(null);
  const [calibConflicts, setCalibConflicts] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [debug, setDebug] = useState(false);
  const panStart = useRef(null);
  const viewportRef = useRef(null);
  const imgRef = useRef(null);
  const fileRef = useRef(null);
  const chromeCheckRef = useRef("");

  useEffect(() => {
    try {
      setDebug(new URLSearchParams(window.location.search).get("debug") === "1");
    } catch {
      setDebug(false);
    }
  }, []);

  const plan = useMemo(
    () => floorPlans.find((p) => Number(p.floor) === Number(activeFloor)) || floorPlans[0] || null,
    [floorPlans, activeFloor]
  );

  const meta = floorPlanMeta || {
    maxLinkMeters: DEFAULT_MAX_LINK_METERS,
    metersPerNorm: DEFAULT_SHORT_SIDE_METERS,
    cameraHeightM: 1.6,
    maxNeighbors: DEFAULT_MAX_NEIGHBORS,
    scaleCalibrated: false,
    sameFloorOnly: true,
    deletedLinks: [],
    addedLinks: [],
  };

  const metersPerNorm = resolveMetersPerNorm(meta);
  const maxLinkMeters = resolveMaxLinkMeters(meta);

  const placed = useMemo(
    () =>
      scenes.filter(
        (s) =>
          !s.hidden &&
          Number.isFinite(Number(s.mapX)) &&
          Number.isFinite(Number(s.mapY)) &&
          (s.floor ?? 0) === (plan?.floor ?? activeFloor)
      ),
    [scenes, plan, activeFloor]
  );

  const unplaced = useMemo(
    () =>
      scenes.filter(
        (s) =>
          !s.hidden &&
          !(Number.isFinite(Number(s.mapX)) && Number.isFinite(Number(s.mapY)))
      ),
    [scenes]
  );

  const placedAllFloors = useMemo(
    () =>
      scenes.filter(
        (s) =>
          !s.hidden &&
          Number.isFinite(Number(s.mapX)) &&
          Number.isFinite(Number(s.mapY))
      ),
    [scenes]
  );

  const totalVisible = scenes.filter((s) => !s.hidden).length;

  const reviewLinks = useMemo(() => {
    const keys = new Set();
    const lines = [];
    for (const s of placed) {
      for (const h of s.hotSpots || []) {
        if (!h?.targetSceneId) continue;
        const t = placed.find((x) => x.id === h.targetSceneId);
        if (!t) continue;
        const k = pairKey(s.id, t.id);
        if (keys.has(k)) continue;
        keys.add(k);
        lines.push({ a: s.id, b: t.id, ax: s.mapX, ay: s.mapY, bx: t.mapX, by: t.mapY });
      }
    }
    return lines;
  }, [placed]);

  useEffect(() => {
    if (floorPlans.length && !floorPlans.some((p) => Number(p.floor) === Number(activeFloor))) {
      setActiveFloor(floorPlans[0].floor);
    }
  }, [floorPlans, activeFloor]);

  // If the stored plan still looks like a full screenshot (browser chrome / dock),
  // force the crop flow rather than rendering it.
  useEffect(() => {
    if (!plan?.url || cropSession || uploading) return;
    if (plan.cropped === true) return;
    if (chromeCheckRef.current === plan.url) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await prepareCropSession(plan.url);
        if (cancelled) return;
        chromeCheckRef.current = plan.url;
        if (session.detection?.needsCrop) {
          setCropSession({
            ...session,
            floor: plan.floor ?? activeFloor,
            remap: placed.length > 0,
          });
          setUploadErr(
            "התוכנית עדיין נראית כמו צילום מסך מלא (כולל chrome/dock). חתוך לפני המשך."
          );
        }
      } catch {
        chromeCheckRef.current = plan.url;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when plan URL changes
  }, [plan?.url, plan?.cropped, plan?.floor, cropSession, uploading, activeFloor, placed.length]);

  const markDirty = () => onDirty?.();

  const updateMeta = (patch) => {
    onFloorPlanMetaChange({ ...meta, ...patch });
    markDirty();
  };

  const uploadPlan = async (file) => {
    if (!jobId || !file) return;
    setUploading(true);
    setUploadErr("");
    try {
      const session = await prepareCropSession(file);
      setCropSession({ ...session, floor: activeFloor, remap: false });
    } catch (err) {
      setUploadErr(err.message || "העלאה נכשלה");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startRecropCurrent = async () => {
    if (!plan?.url) return;
    setUploading(true);
    setUploadErr("");
    try {
      const session = await prepareCropSession(plan.url);
      setCropSession({
        ...session,
        floor: plan.floor ?? activeFloor,
        remap: true,
      });
    } catch (err) {
      setUploadErr(err.message || "טעינת תוכנית לחיתוך נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const finishCrop = async ({ crop, blob }) => {
    if (!jobId || !cropSession) return;
    setUploading(true);
    setUploadErr("");
    try {
      const floor = cropSession.floor ?? activeFloor;
      const fd = new FormData();
      fd.append("file", blob, `floorplan-f${floor}.jpg`);
      fd.append("floor", String(floor));
      fd.append("label", `קומה ${floor}`);
      const res = await fetch(`/api/pipeline/jobs/${jobId}/tour/floorplan`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "העלאה נכשלה");
      const next = [
        ...floorPlans.filter((p) => Number(p.floor) !== Number(data.floorPlan.floor)),
        { ...data.floorPlan, cropped: true },
      ];
      next.sort((a, b) => a.floor - b.floor);
      onFloorPlansChange(next);
      setActiveFloor(data.floorPlan.floor);
      chromeCheckRef.current = data.floorPlan.url;
      if (cropSession.remap) {
        onScenesChange(remapScenesToCrop(scenes, floor, crop));
      }
      // Reset scale estimate for cropped plan (short side ≈ DEFAULT_SHORT_SIDE_METERS)
      if (!meta.scaleCalibrated) {
        updateMeta({ metersPerNorm: DEFAULT_SHORT_SIDE_METERS });
      }
      setCropSession(null);
      markDirty();
    } catch (err) {
      setUploadErr(err.message || "שמירת חיתוך נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const regenerate = () => {
    const allPlaced = scenes.filter(
      (s) => !s.hidden && Number.isFinite(Number(s.mapX)) && Number.isFinite(Number(s.mapY))
    );
    const edges = generateAutoLinks(allPlaced, {
      maxLinkMeters,
      metersPerNorm,
      maxNeighbors: meta.maxNeighbors ?? DEFAULT_MAX_NEIGHBORS,
      cameraHeightM: meta.cameraHeightM ?? 1.6,
      sameFloorOnly: meta.sameFloorOnly !== false,
      deletedLinks: meta.deletedLinks || [],
      addedLinks: meta.addedLinks || [],
      scaleCalibrated: meta.scaleCalibrated,
    });
    const next = applyAutoLinksToScenes(scenes, edges);
    onScenesChange(next);
    setLinkSummary(summarizeAutoLinks(next, edges));
    setCalibConflicts(findCalibrationConflicts(next));
    markDirty();
  };

  // Quick-calibrate: listen for panorama doorway clicks from TourEditor
  useEffect(() => {
    const onPick = (ev) => {
      const { fromId, toId, yaw } = ev.detail || {};
      if (!fromId || !toId || !Number.isFinite(Number(yaw))) return;
      const a = scenes.find((s) => s.id === fromId);
      const b = scenes.find((s) => s.id === toId);
      if (!a || !b) return;
      if (!Number.isFinite(a.mapX) || !Number.isFinite(b.mapX)) return;
      const offset = northOffsetFromDoorway(a.mapX, a.mapY, b.mapX, b.mapY, yaw);
      const withOffset = scenes.map((s) =>
        s.id === fromId ? { ...s, northOffset: offset } : s
      );
      const edges = generateAutoLinks(
        withOffset.filter(
          (s) => !s.hidden && Number.isFinite(Number(s.mapX)) && Number.isFinite(Number(s.mapY))
        ),
        {
          maxLinkMeters,
          metersPerNorm,
          maxNeighbors: meta.maxNeighbors ?? DEFAULT_MAX_NEIGHBORS,
          cameraHeightM: meta.cameraHeightM ?? 1.6,
          sameFloorOnly: meta.sameFloorOnly !== false,
          deletedLinks: meta.deletedLinks || [],
          addedLinks: meta.addedLinks || [],
          scaleCalibrated: meta.scaleCalibrated,
        }
      );
      const next = applyAutoLinksToScenes(withOffset, edges);
      onScenesChange(next);
      setCalibConflicts(findCalibrationConflicts(next));
      setLinkSummary(summarizeAutoLinks(next, edges));
      markDirty();
      setMode("orient");
      setQuickTargetId(null);
      try {
        window.dispatchEvent(
          new CustomEvent("visio-calib-preview", {
            detail: {
              fromId,
              toId,
              yaw: hotspotYaw(a.mapX, a.mapY, b.mapX, b.mapY, offset),
              pitch: hotspotPitch(Math.hypot(b.mapX - a.mapX, b.mapY - a.mapY), {
                metersPerNorm,
                cameraHeightM: meta.cameraHeightM ?? 1.6,
                distM:
                  Math.hypot(b.mapX - a.mapX, b.mapY - a.mapY) * metersPerNorm,
              }),
              label: friendlyRoomLabel(b),
            },
          })
        );
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("visio-pano-pick-done", onPick);
    return () => window.removeEventListener("visio-pano-pick-done", onPick);
  }, [scenes, metersPerNorm, meta.cameraHeightM]);

  useEffect(() => {
    setCalibConflicts(findCalibrationConflicts(scenes));
  }, [scenes]);

  const clientToNorm = useCallback((clientX, clientY) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  const placeAt = (sceneId, x, y) => {
    const floor = plan?.floor ?? activeFloor;
    onScenesChange(
      scenes.map((s) =>
        s.id === sceneId
          ? { ...s, mapX: x, mapY: y, floor }
          : s
      )
    );
    markDirty();
    setSelectedMapId(sceneId);
    onSelectScene?.(sceneId);
    // Auto-select next unplaced
    const rest = scenes.filter(
      (s) =>
        s.id !== sceneId &&
        !s.hidden &&
        !(Number.isFinite(Number(s.mapX)) && Number.isFinite(Number(s.mapY)))
    );
    if (rest[0]) setDragSceneId(rest[0].id);
    else setDragSceneId(null);
  };

  const removeFromPlan = (sceneId) => {
    onScenesChange(
      scenes.map((s) => {
        if (s.id !== sceneId) return s;
        const { mapX, mapY, floor, northOffset, ...rest } = s;
        return rest;
      })
    );
    markDirty();
    if (selectedMapId === sceneId) setSelectedMapId(null);
  };

  const movePoint = (sceneId, x, y) => {
    onScenesChange(
      scenes.map((s) => (s.id === sceneId ? { ...s, mapX: x, mapY: y } : s))
    );
    markDirty();
  };

  const setNorthOffset = (sceneId, offset) => {
    onScenesChange(
      scenes.map((s) => (s.id === sceneId ? { ...s, northOffset: offset } : s))
    );
    markDirty();
  };

  const deleteLink = (a, b) => {
    const k = pairKey(a, b);
    const deleted = [...(meta.deletedLinks || []).filter(([x, y]) => pairKey(x, y) !== k), [a, b]];
    const added = (meta.addedLinks || []).filter(([x, y]) => pairKey(x, y) !== k);
    updateMeta({ deletedLinks: deleted, addedLinks: added });
    onScenesChange(
      scenes.map((s) => {
        if (s.id !== a && s.id !== b) return s;
        return {
          ...s,
          hotSpots: (s.hotSpots || []).filter((h) => {
            if (s.id === a && h.targetSceneId === b) return false;
            if (s.id === b && h.targetSceneId === a) return false;
            return true;
          }),
        };
      })
    );
  };

  const addLinkPair = (aId, bId) => {
    const a = scenes.find((s) => s.id === aId);
    const b = scenes.find((s) => s.id === bId);
    if (!a || !b || aId === bId) return;
    if (!Number.isFinite(a.mapX) || !Number.isFinite(b.mapX)) return;
    const k = pairKey(aId, bId);
    const deleted = (meta.deletedLinks || []).filter(([x, y]) => pairKey(x, y) !== k);
    const added = [...(meta.addedLinks || []).filter(([x, y]) => pairKey(x, y) !== k), [aId, bId]];
    updateMeta({ deletedLinks: deleted, addedLinks: added });
    const d = Math.hypot(b.mapX - a.mapX, b.mapY - a.mapY);
    const pitchOpts = {
      metersPerNorm,
      cameraHeightM: meta.cameraHeightM ?? 1.6,
      distM: d * metersPerNorm,
    };
    const stamp = Date.now().toString(36);
    onScenesChange(
      scenes.map((s) => {
        if (s.id === aId) {
          const without = (s.hotSpots || []).filter((h) => h.targetSceneId !== bId);
          return {
            ...s,
            hotSpots: [
              ...without,
              {
                id: `hs_manual_${aId}_${bId}_${stamp}`,
                yaw: hotspotYaw(a.mapX, a.mapY, b.mapX, b.mapY, a.northOffset),
                pitch: hotspotPitch(d, pitchOpts),
                targetSceneId: bId,
                text: friendlyRoomLabel(b),
                source: "auto",
              },
            ],
          };
        }
        if (s.id === bId) {
          const without = (s.hotSpots || []).filter((h) => h.targetSceneId !== aId);
          return {
            ...s,
            hotSpots: [
              ...without,
              {
                id: `hs_manual_${bId}_${aId}_${stamp}`,
                yaw: hotspotYaw(b.mapX, b.mapY, a.mapX, a.mapY, b.northOffset),
                pitch: hotspotPitch(d, pitchOpts),
                targetSceneId: aId,
                text: friendlyRoomLabel(a),
                source: "auto",
              },
            ],
          };
        }
        return s;
      })
    );
  };

  const onMapPointerDown = (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey) || mode === "place" && !dragSceneId && e.button === 0 && !e.target?.closest?.("[data-map-point]")) {
      // start pan when middle-click / alt, or empty place click without drag selection uses pan via space — use wheel+drag differently
    }
    if (e.button === 0 && (e.altKey || e.shiftKey)) {
      setPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    const norm = clientToNorm(e.clientX, e.clientY);
    if (!norm || !plan) return;

    if (mode === "place" && dragSceneId) {
      placeAt(dragSceneId, norm.x, norm.y);
      return;
    }

    if (mode === "orient" && selectedMapId) {
      const sc = scenes.find((s) => s.id === selectedMapId);
      if (!sc || !Number.isFinite(sc.mapX)) return;
      // Auto-read current panorama yaw from the editor viewer (two-click flow)
      try {
        window.dispatchEvent(new CustomEvent("visio-read-yaw"));
      } catch {
        /* ignore */
      }
      const panoYaw =
        typeof window.__visioEditorYaw === "number"
          ? window.__visioEditorYaw
          : orientPanoYaw;
      setOrientPanoYaw(panoYaw);
      const bearing = mapBearing(sc.mapX, sc.mapY, norm.x, norm.y);
      const offset = bearing - panoYaw;
      setNorthOffset(selectedMapId, offset);
      const neighbor = placed.find((s) => s.id !== selectedMapId);
      if (neighbor) {
        try {
          window.dispatchEvent(
            new CustomEvent("visio-calib-preview", {
              detail: {
                fromId: selectedMapId,
                toId: neighbor.id,
                yaw: hotspotYaw(
                  sc.mapX,
                  sc.mapY,
                  neighbor.mapX,
                  neighbor.mapY,
                  offset
                ),
                pitch: hotspotPitch(
                  Math.hypot(neighbor.mapX - sc.mapX, neighbor.mapY - sc.mapY),
                  {
                    metersPerNorm,
                    cameraHeightM: meta.cameraHeightM ?? 1.6,
                  }
                ),
                label: friendlyRoomLabel(neighbor),
              },
            })
          );
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (mode === "link") {
      // click nearest point
      let best = null;
      let bestD = 0.04;
      for (const s of placed) {
        const d = Math.hypot(s.mapX - norm.x, s.mapY - norm.y);
        if (d < bestD) {
          bestD = d;
          best = s.id;
        }
      }
      if (!best) return;
      if (!linkFromId) {
        setLinkFromId(best);
      } else if (linkFromId === best) {
        setLinkFromId(null);
      } else {
        addLinkPair(linkFromId, best);
        setLinkFromId(null);
      }
      return;
    }

    if (mode === "scale") {
      if (scalePts.length >= 2) setScalePts([norm]);
      else setScalePts((pts) => [...pts, norm]);
    }
  };

  const onMapPointerMove = (e) => {
    if (panning && panStart.current) {
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    }
  };

  const onMapPointerUp = () => {
    setPanning(false);
    panStart.current = null;
  };

  const applyScale = () => {
    if (scalePts.length < 2) return;
    const m = Number(scaleMeters);
    if (!(m > 0)) return;
    const [p1, p2] = scalePts;
    const mpn = metersPerNormFromLine(p1.x, p1.y, p2.x, p2.y, m);
    updateMeta({ metersPerNorm: mpn, scaleCalibrated: true });
    setScalePts([]);
  };

  const selected = scenes.find((s) => s.id === selectedMapId) || null;

  return (
    <div style={{ marginTop: 24 }}>
      <div className="visio-admin-section-title" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <MapIcon size={16} /> תוכנית קומה
      </div>
      <p style={{ fontSize: 12, color: ADMIN.muted, marginBottom: 12, lineHeight: 1.6 }}>
        העלה צילום מסך → חתוך את תוכנית הקומה בלבד → גרור סצנות לנקודות.
        כייל קנה־מידה (קו באורך ידוע) ואז הגדר מרחק קישור במטרים (ברירת מחדל 6מ׳).
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <label className="visio-admin-label" style={{ margin: 0 }}>קומה</label>
        <input
          className="visio-admin-input"
          type="number"
          style={{ width: 72, padding: "8px 10px" }}
          value={activeFloor}
          onChange={(e) => setActiveFloor(Number(e.target.value) || 0)}
        />
        <button
          type="button"
          className="visio-admin-btn-ghost"
          disabled={uploading || !jobId}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 size={14} className="visio-spin" /> : <Upload size={14} />}
          העלה תוכנית
        </button>
        {plan?.url && (
          <button
            type="button"
            className="visio-admin-btn-ghost"
            disabled={uploading}
            onClick={startRecropCurrent}
          >
            חתוך תוכנית
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => uploadPlan(e.target.files?.[0])}
        />
        <span style={{ fontSize: 12, color: ADMIN.gold, fontWeight: 600 }}>
          {placedAllFloors.length} / {totalVisible} מוקמו
        </span>
      </div>
      {uploadErr && (
        <div className="visio-admin-error" style={{ marginBottom: 10 }}>{uploadErr}</div>
      )}

      {/* Thumbnail strip */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
        {(dragSceneId ? [scenes.find((s) => s.id === dragSceneId)].filter(Boolean).concat(unplaced.filter((s) => s.id !== dragSceneId)) : unplaced)
          .slice(0, 40)
          .map((s) => (
            <button
              key={s.id}
              type="button"
              draggable
              onDragStart={() => {
                setDragSceneId(s.id);
                setMode("place");
              }}
              onClick={() => {
                setDragSceneId(s.id);
                setMode("place");
                onSelectScene?.(s.id);
              }}
              style={{
                flex: "0 0 auto",
                width: 72,
                padding: 0,
                border:
                  dragSceneId === s.id
                    ? "2px solid var(--visio-gold)"
                    : "1px solid var(--visio-border-subtle)",
                background: "var(--visio-input-bg)",
                cursor: "grab",
                borderRadius: 2,
                overflow: "hidden",
              }}
              title={s.title || s.id}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.panoramaUrl}
                alt=""
                style={{ width: "100%", height: 40, objectFit: "cover", display: "block" }}
              />
              <div style={{ fontSize: 9, color: ADMIN.muted, padding: "2px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.title || s.id}
              </div>
            </button>
          ))}
        {unplaced.length === 0 && (
          <span style={{ fontSize: 12, color: ADMIN.muted }}>כל הסצנות מוקמו</span>
        )}
      </div>

      {/* Mode toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {[
          { id: "place", label: "מיקום", Icon: Crosshair },
          { id: "orient", label: "כיוון צפון", Icon: Navigation },
          { id: "quickOrient", label: "כיול מהיר", Icon: Navigation },
          { id: "link", label: "קישורים", Icon: Link2 },
          { id: "scale", label: "קנה־מידה", Icon: Ruler },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="visio-admin-btn-ghost"
            style={{
              color: mode === id ? ADMIN.gold : undefined,
              borderColor: mode === id ? "var(--visio-gold-border-strong)" : undefined,
            }}
            onClick={() => {
              setMode(id);
              setLinkFromId(null);
              setScalePts([]);
              setQuickTargetId(null);
            }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
        <button type="button" className="visio-admin-btn-primary" onClick={regenerate} disabled={placedAllFloors.length < 2}>
          חשב מחדש
        </button>
        <button type="button" className="visio-admin-btn-ghost" onClick={() => setZoom((z) => Math.min(4, z * 1.25))}>
          <ZoomIn size={14} />
        </button>
        <button type="button" className="visio-admin-btn-ghost" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>
          <ZoomOut size={14} />
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: ADMIN.muted }}>
          מרחק קישור מקס׳{" "}
          <span dir="ltr">{maxLinkMeters.toFixed(1)} m</span>
        </label>
        <input
          type="range"
          min={2}
          max={12}
          step={0.5}
          value={maxLinkMeters}
          onChange={(e) => updateMeta({ maxLinkMeters: Number(e.target.value) })}
          style={{ width: 160 }}
        />
        <label style={{ fontSize: 11, color: ADMIN.muted, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={meta.sameFloorOnly !== false}
            onChange={(e) => updateMeta({ sameFloorOnly: e.target.checked })}
          />
          רק באותה קומה
        </label>
        {mode === "scale" && (
          <>
            <input
              className="visio-admin-input"
              style={{ width: 80, padding: "6px 8px" }}
              value={scaleMeters}
              onChange={(e) => setScaleMeters(e.target.value)}
              placeholder="מטרים"
            />
            <button type="button" className="visio-admin-btn-ghost" disabled={scalePts.length < 2} onClick={applyScale}>
              החל קנה־מידה
            </button>
            {meta.scaleCalibrated ? (
              <span style={{ fontSize: 11, color: ADMIN.success }}>מכויל</span>
            ) : (
              <span style={{ fontSize: 11, color: ADMIN.muted }}>
                ללא כיול: צד קצר ≈ {DEFAULT_SHORT_SIDE_METERS}מ׳
              </span>
            )}
          </>
        )}
      </div>

      {linkSummary && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            background: "var(--visio-input-bg)",
            border: "1px solid var(--visio-border-subtle)",
            fontSize: 12,
            color: ADMIN.text,
            lineHeight: 1.6,
          }}
        >
          חשב מחדש: <strong>{linkSummary.linkCount}</strong> קישורים ·{" "}
          {linkSummary.placedCount} סצנות מוקמו ·{" "}
          <strong>{linkSummary.zeroLinkCount}</strong> ללא קישור
          {linkSummary.zeroLinkTitles?.length > 0 && (
            <span style={{ color: ADMIN.muted }}>
              {" "}
              ({linkSummary.zeroLinkTitles.slice(0, 5).join(", ")}
              {linkSummary.zeroLinkTitles.length > 5 ? "…" : ""})
            </span>
          )}
        </div>
      )}

      {mode === "orient" && selected && (
        <div style={{ marginBottom: 10, padding: 10, background: "var(--visio-input-bg)", border: "1px solid var(--visio-border-subtle)", fontSize: 12, color: ADMIN.text, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 6 }}>
            כיול ל־<strong>{friendlyRoomLabel(selected)}</strong>: סובב את הפנורמה לכיוון מוכר,
            ואז לחץ על התוכנית באותו כיוון. אחרי הכיול תופיע חץ בתצוגה לחדר הבא.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>yaw פנורמה (מעלות)</label>
            <input
              className="visio-admin-input"
              type="number"
              step="1"
              style={{ width: 100, padding: "6px 8px" }}
              value={orientPanoYaw}
              onChange={(e) => setOrientPanoYaw(Number(e.target.value) || 0)}
            />
            <button
              type="button"
              className="visio-admin-btn-ghost"
              onClick={() => {
                const ev = new CustomEvent("visio-read-yaw", { detail: {} });
                window.dispatchEvent(ev);
                if (typeof window.__visioEditorYaw === "number") {
                  setOrientPanoYaw(window.__visioEditorYaw);
                }
              }}
            >
              קרא yaw מהצופה
            </button>
            {Number.isFinite(selected.northOffset) && (
              <span style={{ color: ADMIN.muted }} dir="ltr">
                northOffset={selected.northOffset.toFixed(1)}°
              </span>
            )}
          </div>
        </div>
      )}

      {mode === "quickOrient" && selected && Number.isFinite(selected.mapX) && (
        <div style={{ marginBottom: 10, padding: 10, background: "var(--visio-input-bg)", border: "1px solid var(--visio-border-subtle)", fontSize: 12, color: ADMIN.text, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>כיול מהיר</strong> ל־{friendlyRoomLabel(selected)}: בחר חדר שכן, ואז לחץ
            בפנורמה על הפתח שמוביל אליו. בלי חוגה.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {placed
              .filter((s) => s.id !== selected.id)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="visio-admin-btn-ghost"
                  style={{
                    color: quickTargetId === s.id ? ADMIN.gold : undefined,
                    borderColor:
                      quickTargetId === s.id ? "var(--visio-gold-border-strong)" : undefined,
                  }}
                  onClick={() => {
                    setQuickTargetId(s.id);
                    onSelectScene?.(selected.id);
                    window.dispatchEvent(
                      new CustomEvent("visio-arm-pano-pick", {
                        detail: {
                          fromId: selected.id,
                          toId: s.id,
                          label: friendlyRoomLabel(s),
                        },
                      })
                    );
                  }}
                >
                  {friendlyRoomLabel(s)}
                </button>
              ))}
          </div>
          {quickTargetId && (
            <div style={{ marginTop: 8, color: ADMIN.gold }}>
              לחץ עכשיו בפנורמה על הפתח ל־
              {friendlyRoomLabel(scenes.find((s) => s.id === quickTargetId) || {})}
            </div>
          )}
        </div>
      )}

      {calibConflicts.length > 0 && (
        <div
          className="visio-admin-error"
          style={{ marginBottom: 10, fontSize: 12, lineHeight: 1.5 }}
        >
          {calibConflicts.slice(0, 4).map((c) => (
            <div key={`${c.aId}-${c.bId}`}>{c.message}</div>
          ))}
        </div>
      )}

      {mode === "link" && (
        <div style={{ fontSize: 12, color: ADMIN.muted, marginBottom: 8 }}>
          לחץ על נקודה ואז על נקודה שנייה להוספת קישור. לחץ על קו למחיקה.
          {linkFromId ? ` · נבחר: ${scenes.find((s) => s.id === linkFromId)?.title || linkFromId}` : ""}
        </div>
      )}

      {/* Plan viewport */}
      <div
        ref={viewportRef}
        style={{
          position: "relative",
          height: 420,
          overflow: "hidden",
          background: "#1a1a1a",
          border: "1px solid var(--visio-border-subtle)",
          borderRadius: 2,
          cursor: mode === "place" && dragSceneId ? "crosshair" : panning ? "grabbing" : "default",
          userSelect: "none",
        }}
        onPointerDown={onMapPointerDown}
        onPointerMove={onMapPointerMove}
        onPointerUp={onMapPointerUp}
        onPointerLeave={onMapPointerUp}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const id = dragSceneId || e.dataTransfer.getData("text/scene-id");
          const norm = clientToNorm(e.clientX, e.clientY);
          if (id && norm) placeAt(id, norm.x, norm.y);
        }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setZoom((z) => Math.max(0.5, Math.min(4, z * (e.deltaY > 0 ? 0.9 : 1.1))));
        }}
      >
        {!plan ? (
          <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: ADMIN.muted, fontSize: 13 }}>
            העלה תמונת תוכנית קומה (jpg/png)
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={plan.url}
              alt="floor plan"
              draggable={false}
              onLoad={() => {}}
              style={{
                display: "block",
                maxWidth: 640,
                maxHeight: 400,
                width: "auto",
                height: "auto",
                pointerEvents: "none",
              }}
            />
            {/* SVG overlay sized to image box */}
            <svg
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                overflow: "visible",
              }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {reviewLinks.map((ln) => (
                <line
                  key={`${ln.a}-${ln.b}`}
                  x1={ln.ax * 100}
                  y1={ln.ay * 100}
                  x2={ln.bx * 100}
                  y2={ln.by * 100}
                  stroke="rgba(201,168,76,0.85)"
                  strokeWidth={0.6}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (mode === "link") deleteLink(ln.a, ln.b);
                  }}
                />
              ))}
              {debug &&
                placed.flatMap((s) =>
                  (s.hotSpots || [])
                    .filter((h) => h.targetSceneId)
                    .map((h) => {
                      const t = placed.find((x) => x.id === h.targetSceneId);
                      if (!t) return null;
                      const bearing = mapBearing(s.mapX, s.mapY, t.mapX, t.mapY);
                      const len = 5;
                      return (
                        <line
                          key={`dbg-${s.id}-${h.targetSceneId}`}
                          x1={s.mapX * 100}
                          y1={s.mapY * 100}
                          x2={s.mapX * 100 + Math.sin((bearing * Math.PI) / 180) * len}
                          y2={s.mapY * 100 - Math.cos((bearing * Math.PI) / 180) * len}
                          stroke="#60b0f0"
                          strokeWidth={0.55}
                          markerEnd="url(#arrow)"
                        />
                      );
                    })
                    .filter(Boolean)
                )}
              {scalePts.length === 2 && (
                <line
                  x1={scalePts[0].x * 100}
                  y1={scalePts[0].y * 100}
                  x2={scalePts[1].x * 100}
                  y2={scalePts[1].y * 100}
                  stroke="#60b0f0"
                  strokeWidth={0.5}
                  strokeDasharray="2 1"
                />
              )}
              {mode === "orient" && selected && Number.isFinite(selected.mapX) && (
                <g>
                  {/* north arrow tip at click — show current northOffset direction */}
                  {Number.isFinite(selected.northOffset) && (() => {
                    const ang = ((selected.northOffset) * Math.PI) / 180;
                    // map north = -Y; arrow from point along northOffset in map bearing space
                    // When panorama yaw=0 faces map bearing = northOffset
                    const len = 4;
                    const dx = Math.sin(ang) * len;
                    const dy = -Math.cos(ang) * len;
                    return (
                      <line
                        x1={selected.mapX * 100}
                        y1={selected.mapY * 100}
                        x2={selected.mapX * 100 + dx}
                        y2={selected.mapY * 100 + dy}
                        stroke="#ef4444"
                        strokeWidth={0.7}
                        markerEnd="url(#arrow)"
                      />
                    );
                  })()}
                </g>
              )}
              {placed.map((s) => {
                const active = s.id === selectedMapId || s.id === activeSceneId;
                return (
                  <g key={s.id} data-map-point={s.id}>
                    <circle
                      cx={s.mapX * 100}
                      cy={s.mapY * 100}
                      r={active ? 1.8 : 1.35}
                      fill={active ? "rgba(239,68,68,0.9)" : "rgba(255,255,255,0.75)"}
                      stroke={active ? "#fff" : "rgba(0,0,0,0.35)"}
                      strokeWidth={0.25}
                      style={{ cursor: "pointer" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedMapId(s.id);
                        onSelectScene?.(s.id);
                        if (mode === "place") {
                          const move = (ev) => {
                            const n = clientToNorm(ev.clientX, ev.clientY);
                            if (n) movePoint(s.id, n.x, n.y);
                          };
                          const up = () => {
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", up);
                          };
                          window.addEventListener("pointermove", move);
                          window.addEventListener("pointerup", up);
                        }
                      }}
                    />
                    {Number.isFinite(s.northOffset) && (
                      <circle
                        cx={s.mapX * 100}
                        cy={s.mapY * 100}
                        r={2.2}
                        fill="none"
                        stroke="rgba(96,176,240,0.7)"
                        strokeWidth={0.25}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {selected && Number.isFinite(selected.mapX) && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: ADMIN.muted }}>
          <span>
            נבחר: {selected.title || selected.id}{" "}
            <span dir="ltr">
              ({selected.mapX.toFixed(3)}, {selected.mapY.toFixed(3)})
            </span>
          </span>
          <button
            type="button"
            className="visio-admin-btn-ghost"
            style={{ color: ADMIN.error, padding: "4px 8px" }}
            onClick={() => removeFromPlan(selected.id)}
          >
            <Trash2 size={12} /> הסר מהתוכנית
          </button>
        </div>
      )}

      {unplaced.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: ADMIN.muted, marginBottom: 6 }}>
            לא מוקמו ({unplaced.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {unplaced.map((s) => (
              <button
                key={s.id}
                type="button"
                className="visio-admin-btn-ghost"
                style={{
                  padding: "4px 8px",
                  fontSize: 11,
                  borderColor: dragSceneId === s.id ? "var(--visio-gold)" : undefined,
                }}
                onClick={() => {
                  setDragSceneId(s.id);
                  setMode("place");
                  onSelectScene?.(s.id);
                }}
              >
                {s.title || s.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {cropSession && (
        <FloorPlanCropModal
          source={cropSession.source}
          initialCrop={cropSession.initialCrop}
          detection={cropSession.detection}
          onCancel={() => setCropSession(null)}
          onConfirm={finishCrop}
        />
      )}
    </div>
  );
}
