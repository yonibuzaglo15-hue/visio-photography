"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2, Map as MapIcon, Trash2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { ADMIN } from "./theme.js";
import FloorPlanCropModal, { prepareCropSession } from "./FloorPlanCropModal.jsx";
import {
  DEFAULT_SHORT_SIDE_METERS,
  friendlyRoomLabel,
  remapScenesToCrop,
} from "../../lib/tour/floor-plan.js";

/**
 * Floor plan = mini-map positions only.
 * Never generates hotspots / yaw / pitch — discs come only from panorama floor clicks.
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
  const [activeFloor, setActiveFloor] = useState(() => floorPlans[0]?.floor ?? 0);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [cropSession, setCropSession] = useState(null);
  const [dragSceneId, setDragSceneId] = useState(null);
  const [selectedMapId, setSelectedMapId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef(null);
  const viewportRef = useRef(null);
  const imgRef = useRef(null);
  const fileRef = useRef(null);
  const chromeCheckRef = useRef("");

  const plan = useMemo(
    () =>
      floorPlans.find((p) => Number(p.floor) === Number(activeFloor)) ||
      floorPlans[0] ||
      null,
    [floorPlans, activeFloor]
  );

  const meta = floorPlanMeta || {
    metersPerNorm: DEFAULT_SHORT_SIDE_METERS,
    cameraHeightM: 1.6,
    scaleCalibrated: false,
    deletedLinks: [],
    addedLinks: [],
  };

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

  useEffect(() => {
    if (
      floorPlans.length &&
      !floorPlans.some((p) => Number(p.floor) === Number(activeFloor))
    ) {
      setActiveFloor(floorPlans[0].floor);
    }
  }, [floorPlans, activeFloor]);

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
            "התוכנית עדיין נראית כמו צילום מסך מלא. חתוך לפני המשך."
          );
        }
      } catch {
        chromeCheckRef.current = plan.url;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan?.url, plan?.cropped, plan?.floor, cropSession, uploading, activeFloor, placed.length]);

  const markDirty = () => onDirty?.();

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
      if (!meta.scaleCalibrated) {
        onFloorPlanMetaChange({
          ...meta,
          metersPerNorm: DEFAULT_SHORT_SIDE_METERS,
        });
      }
      setCropSession(null);
      markDirty();
    } catch (err) {
      setUploadErr(err.message || "שמירת חיתוך נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const placeAt = (sceneId, x, y) => {
    onScenesChange(
      scenes.map((s) =>
        s.id === sceneId
          ? { ...s, mapX: x, mapY: y, floor: plan?.floor ?? activeFloor }
          : s
      )
    );
    setDragSceneId(null);
    setSelectedMapId(sceneId);
    onSelectScene?.(sceneId);
    markDirty();
  };

  const removeFromPlan = (sceneId) => {
    onScenesChange(
      scenes.map((s) => {
        if (s.id !== sceneId) return s;
        const { mapX, mapY, floor, ...rest } = s;
        return rest;
      })
    );
    if (selectedMapId === sceneId) setSelectedMapId(null);
    markDirty();
  };

  const movePoint = (sceneId, x, y) => {
    onScenesChange(
      scenes.map((s) => (s.id === sceneId ? { ...s, mapX: x, mapY: y } : s))
    );
    markDirty();
  };

  const clientToNorm = (clientX, clientY) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const onMapPointerDown = (e) => {
    if (e.button === 1 || e.altKey) {
      setPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }
    const norm = clientToNorm(e.clientX, e.clientY);
    if (!norm) return;

    const hit = placed.find(
      (s) => Math.hypot(s.mapX - norm.x, s.mapY - norm.y) < 0.035 / zoom
    );
    if (hit) {
      setSelectedMapId(hit.id);
      onSelectScene?.(hit.id);
      setDragSceneId(hit.id);
      return;
    }

    if (dragSceneId) {
      placeAt(dragSceneId, norm.x, norm.y);
      return;
    }
    if (activeSceneId && !placed.some((s) => s.id === activeSceneId)) {
      placeAt(activeSceneId, norm.x, norm.y);
    }
  };

  const onMapPointerMove = (e) => {
    if (panning && panStart.current) {
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      return;
    }
    if (!dragSceneId || !placed.some((s) => s.id === dragSceneId)) return;
    const norm = clientToNorm(e.clientX, e.clientY);
    if (norm) movePoint(dragSceneId, norm.x, norm.y);
  };

  const onMapPointerUp = () => {
    setPanning(false);
    panStart.current = null;
    if (dragSceneId && placed.some((s) => s.id === dragSceneId)) {
      setDragSceneId(null);
    }
  };

  const selected = scenes.find((s) => s.id === selectedMapId) || null;

  return (
    <div style={{ marginTop: 24 }}>
      <div
        className="visio-admin-section-title"
        style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}
      >
        <MapIcon size={16} /> תוכנית קומה (מפת מיני בלבד)
      </div>
      <p style={{ fontSize: 12, color: ADMIN.muted, marginBottom: 12, lineHeight: 1.6 }}>
        מיקומי הסצנות על התוכנית משמשים רק את מפת המיני בסיור. דיסקיות ניווט נקבעות אך ורק
        בלחיצה על הרצפה בפנורמה — לא מחושבות מהתוכנית.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <label className="visio-admin-label" style={{ margin: 0 }}>
          קומה
        </label>
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
          {placedAllFloors.length} / {totalVisible} על המפה
        </span>
        <button
          type="button"
          className="visio-admin-btn-ghost"
          onClick={() => setZoom((z) => Math.min(4, z * 1.2))}
          aria-label="הגדל"
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="visio-admin-btn-ghost"
          onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}
          aria-label="הקטן"
        >
          <ZoomOut size={14} />
        </button>
      </div>
      {uploadErr && (
        <div className="visio-admin-error" style={{ marginBottom: 10 }}>
          {uploadErr}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 8,
        }}
      >
        {unplaced.slice(0, 40).map((s) => (
          <button
            key={s.id}
            type="button"
            draggable
            onDragStart={() => setDragSceneId(s.id)}
            onClick={() => {
              setDragSceneId(s.id);
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
            title={friendlyRoomLabel(s)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.panoramaUrl}
              alt=""
              style={{ width: "100%", height: 40, objectFit: "cover", display: "block" }}
            />
            <div
              style={{
                fontSize: 9,
                color: ADMIN.muted,
                padding: "2px 4px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {friendlyRoomLabel(s)}
            </div>
          </button>
        ))}
        {unplaced.length === 0 && (
          <span style={{ fontSize: 12, color: ADMIN.muted }}>כל הסצנות על המפה</span>
        )}
      </div>

      {dragSceneId && (
        <div
          style={{
            fontSize: 12,
            color: ADMIN.accent,
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Crosshair size={14} />
          לחץ על התוכנית כדי למקם את {friendlyRoomLabel(
            scenes.find((s) => s.id === dragSceneId) || {}
          )}{" "}
          (למפת מיני בלבד)
        </div>
      )}

      <div
        ref={viewportRef}
        style={{
          position: "relative",
          height: 420,
          overflow: "hidden",
          background: "#1a1a1a",
          border: "1px solid var(--visio-border-subtle)",
          borderRadius: 2,
          cursor: dragSceneId ? "crosshair" : panning ? "grabbing" : "default",
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
      >
        {!plan ? (
          <div
            style={{
              display: "flex",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              color: ADMIN.muted,
              fontSize: 13,
            }}
          >
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
              style={{
                display: "block",
                maxWidth: 640,
                maxHeight: 400,
                width: "auto",
                height: "auto",
                pointerEvents: "none",
              }}
            />
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
              {placed.map((s) => {
                const isSel = s.id === selectedMapId || s.id === activeSceneId;
                return (
                  <circle
                    key={s.id}
                    cx={s.mapX * 100}
                    cy={s.mapY * 100}
                    r={isSel ? 2.2 : 1.6}
                    fill={isSel ? "#ef4444" : "rgba(255,255,255,0.85)"}
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth={0.3}
                    style={{ cursor: "pointer" }}
                  >
                    <title>{friendlyRoomLabel(s)}</title>
                  </circle>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {selected && Number.isFinite(Number(selected.mapX)) && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: ADMIN.text }}>
            {friendlyRoomLabel(selected)} · מפה{" "}
            <span dir="ltr">
              ({Number(selected.mapX).toFixed(3)}, {Number(selected.mapY).toFixed(3)})
            </span>
          </span>
          <button
            type="button"
            className="visio-admin-btn-ghost"
            style={{ color: ADMIN.error }}
            onClick={() => removeFromPlan(selected.id)}
          >
            <Trash2 size={13} /> הסר מהתוכנית
          </button>
        </div>
      )}

      {cropSession && (
        <FloorPlanCropModal
          session={cropSession}
          busy={uploading}
          onCancel={() => setCropSession(null)}
          onConfirm={finishCrop}
        />
      )}
    </div>
  );
}
