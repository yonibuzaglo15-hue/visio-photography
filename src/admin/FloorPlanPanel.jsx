"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Loader2,
  Map as MapIcon,
  Scan,
  Share2,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ADMIN } from "./theme.js";
import FloorPlanCropModal, { prepareCropSession } from "./FloorPlanCropModal.jsx";
import { friendlyRoomLabel } from "../../lib/tour/room-label.js";
import {
  planIdFromFloorPlan,
  reconcileMapPlacements,
} from "../../lib/tour/map-plan.js";
import {
  isInsidePlanContent,
  OUTSIDE_PLAN_MESSAGE_HE,
} from "../../lib/tour/plan-content-mask.js";

async function loadMaskViaProxy(planUrl) {
  if (!planUrl || typeof document === "undefined") return null;
  try {
    const res = await fetch(
      `/api/pipeline/plan-proxy?url=${encodeURIComponent(planUrl)}`
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
}

function isPlaced(s) {
  return Number.isFinite(Number(s.mapX)) && Number.isFinite(Number(s.mapY));
}

/** Next visible, unplaced scene after `sceneId` in list order (wraps around). */
function nextUnplacedAfter(scenes, sceneId) {
  const i = scenes.findIndex((s) => s.id === sceneId);
  for (let k = 1; k <= scenes.length; k++) {
    const s = scenes[(i + k) % scenes.length];
    if (s && s.id !== sceneId && !s.hidden && !isPlaced(s)) return s.id;
  }
  return null;
}

/**
 * Floor plan = mini-map positions + local CV suggestions (dots / links).
 * Suggestions never become tour data until the user places a scene or accepts a link.
 * Hotspot yaw/pitch still come from panorama (one-click yaw in TourEditor).
 */
export default function FloorPlanPanel({
  jobId,
  scenes,
  floorPlans,
  activeSceneId,
  onScenesChange,
  onFloorPlansChange,
  onSelectScene,
  onDirty,
  /** Accepted geometric links {id,a,b} — parent owns persistence into hotspots after yaw. */
  geoLinks = [],
  onGeoLinksChange,
}) {
  const [activeFloor, setActiveFloor] = useState(() => floorPlans[0]?.floor ?? 0);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [placeErr, setPlaceErr] = useState("");
  const [cropSession, setCropSession] = useState(null);
  const [dragSceneId, setDragSceneId] = useState(null);
  const [selectedMapId, setSelectedMapId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  /** Local CV candidates — not tour data until a scene is placed on one. */
  const [candidates, setCandidates] = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [pendingLinks, setPendingLinks] = useState([]);
  const [assistMsg, setAssistMsg] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const panStart = useRef(null);
  const viewportRef = useRef(null);
  const imgRef = useRef(null);
  const maskRef = useRef(null);
  const fileRef = useRef(null);
  const chromeCheckRef = useRef("");
  const grabRef = useRef(null);
  const candidateGrabRef = useRef(null);

  const plan = useMemo(
    () =>
      floorPlans.find((p) => Number(p.floor) === Number(activeFloor)) ||
      floorPlans[0] ||
      null,
    [floorPlans, activeFloor]
  );

  const placed = useMemo(() => {
    const planId = planIdFromFloorPlan(plan);
    return scenes.filter((s) => {
      if (s.hidden) return false;
      if (!Number.isFinite(Number(s.mapX)) || !Number.isFinite(Number(s.mapY))) return false;
      if ((s.floor ?? 0) !== (plan?.floor ?? activeFloor)) return false;
      // Hide pins stamped for a different plan version (stale space).
      if (s.mapPlanId && planId && s.mapPlanId !== planId) return false;
      return true;
    });
  }, [scenes, plan, activeFloor]);

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

  const labelOf = (id) => {
    const i = scenes.findIndex((s) => s.id === id);
    return friendlyRoomLabel(scenes[i] || { id }, i + 1);
  };

  /** Scene the next plan click will place (thumbnail pick wins over the active scene). */
  const placeTarget = (() => {
    const id = dragSceneId || activeSceneId;
    const s = scenes.find((x) => x.id === id);
    if (!s || s.hidden) return null;
    if (dragSceneId && placed.some((p) => p.id === dragSceneId)) return null;
    if (!dragSceneId && placedAllFloors.some((p) => p.id === id)) return null;
    return s;
  })();

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
      const stampedPlan = {
        ...data.floorPlan,
        cropped: true,
        planId: planIdFromFloorPlan(data.floorPlan),
        ...(crop ? { cropRect: crop } : {}),
      };
      const next = [
        ...floorPlans.filter((p) => Number(p.floor) !== Number(data.floorPlan.floor)),
        stampedPlan,
      ];
      next.sort((a, b) => a.floor - b.floor);
      onFloorPlansChange(next);
      setActiveFloor(data.floorPlan.floor);
      chromeCheckRef.current = data.floorPlan.url;
      if (cropSession.remap) {
        const newPlanId = stampedPlan.planId;
        const previousPlanId = planIdFromFloorPlan(cropSession.plan || plan);
        const { scenes: reconciled } = reconcileMapPlacements(scenes, {
          floor,
          newPlanId,
          cropRect: crop,
          previousPlanId,
        });
        onScenesChange(reconciled);
      }
      setCropSession(null);
      markDirty();
    } catch (err) {
      setUploadErr(err.message || "שמירת חיתוך נכשלה");
    } finally {
      setUploading(false);
    }
  };

  // Expose mask readiness for E2E
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__visioPlanMaskReady = Boolean(
      maskRef.current && plan?.url && maskRef.current._src === plan.url
    );
  });

  useEffect(() => {
    maskRef.current = null;
    if (typeof window !== "undefined") window.__visioPlanMaskReady = false;
    if (!plan?.url) return undefined;
    let cancelled = false;
    loadMaskViaProxy(plan.url).then((data) => {
      if (cancelled || !data) return;
      data._src = plan.url;
      maskRef.current = data;
      if (typeof window !== "undefined") window.__visioPlanMaskReady = true;
    });
    return () => {
      cancelled = true;
    };
  }, [plan?.url]);

  const placeAt = (sceneId, x, y) => {
    const mask = maskRef.current;
    if (mask) {
      const check = isInsidePlanContent(mask, x, y);
      if (!check.inside) {
        setPlaceErr(OUTSIDE_PLAN_MESSAGE_HE);
        setDragSceneId(null);
        return false;
      }
    }
    setPlaceErr("");
    const planId = planIdFromFloorPlan(plan);
    const wasPlaced = placedAllFloors.some((s) => s.id === sceneId);
    const next = scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            mapX: x,
            mapY: y,
            floor: plan?.floor ?? activeFloor,
            ...(planId ? { mapPlanId: planId } : {}),
          }
        : s
    );
    onScenesChange(next);
    setDragSceneId(null);
    setSelectedMapId(sceneId);
    // Placing many rooms: jump straight to the next unplaced scene.
    const nextUnplaced = wasPlaced ? null : nextUnplacedAfter(next, sceneId);
    onSelectScene?.(nextUnplaced || sceneId);
    markDirty();
    return true;
  };

  // E2E hooks — real placement path, no synthetic coords invented by tests.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__visioPlanMaskReady = Boolean(
      maskRef.current && plan?.url && maskRef.current._src === plan.url
    );
    window.__visioTryPlace = (sceneId, x, y) => placeAt(sceneId, x, y);
    return () => {
      delete window.__visioTryPlace;
    };
  });

  const removeFromPlan = (sceneId) => {
    onScenesChange(
      scenes.map((s) => {
        if (s.id !== sceneId) return s;
        const { mapX, mapY, floor, mapPlanId, ...rest } = s;
        return rest;
      })
    );
    if (selectedMapId === sceneId) setSelectedMapId(null);
    markDirty();
  };

  const movePoint = (sceneId, x, y) => {
    const mask = maskRef.current;
    if (mask) {
      const check = isInsidePlanContent(mask, x, y);
      if (!check.inside) {
        setPlaceErr(OUTSIDE_PLAN_MESSAGE_HE);
        return false;
      }
    }
    setPlaceErr("");
    const planId = planIdFromFloorPlan(plan);
    onScenesChange(
      scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              mapX: x,
              mapY: y,
              ...(planId ? { mapPlanId: planId } : {}),
            }
          : s
      )
    );
    markDirty();
    return true;
  };

  const runDetectDots = async () => {
    if (!jobId || !plan?.url) return;
    setDetecting(true);
    setAssistMsg("");
    setUploadErr("");
    try {
      const res = await fetch(`/api/pipeline/jobs/${jobId}/tour/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect", planUrl: plan.url, floor: plan.floor }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "זיהוי נכשל");
      setCandidates(
        (data.dots || []).map((d) => ({
          id: d.id,
          x: d.x,
          y: d.y,
          score: d.score,
        }))
      );
      setPendingLinks([]);
      setAssistMsg(`${data.dotCount} נקודות זוהו — אשרו / הזיזו / מחקו לפני שיבוץ`);
    } catch (err) {
      setUploadErr(err.message || "זיהוי נכשל");
    } finally {
      setDetecting(false);
    }
  };

  const runSuggestLinks = async () => {
    if (!jobId || !plan?.url || placed.length < 2) return;
    setSuggesting(true);
    setAssistMsg("");
    setUploadErr("");
    try {
      const positions = placed.map((s) => ({
        id: s.id,
        x: Number(s.mapX),
        y: Number(s.mapY),
      }));
      const res = await fetch(`/api/pipeline/jobs/${jobId}/tour/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggestLinks",
          planUrl: plan.url,
          floor: plan.floor,
          positions,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "הצעת קישורים נכשלה");
      const acceptedIds = new Set((geoLinks || []).map((g) => g.id));
      setPendingLinks((data.links || []).filter((L) => !acceptedIds.has(L.id)));
      setAssistMsg(
        `${data.linkCount} קישורים מוצעים` +
          (data.diagonalCount ? ` · ${data.diagonalCount} אלכסונים (אפשר למחוק בבת אחת)` : "")
      );
    } catch (err) {
      setUploadErr(err.message || "הצעת קישורים נכשלה");
    } finally {
      setSuggesting(false);
    }
  };

  const acceptLink = (link) => {
    const next = [...(geoLinks || []).filter((g) => g.id !== link.id), { ...link, accepted: true }];
    onGeoLinksChange?.(next);
    setPendingLinks((prev) => prev.filter((L) => L.id !== link.id));
    onDirty?.();
  };

  const acceptAllPendingLinks = () => {
    const next = [...(geoLinks || [])];
    for (const link of pendingLinks) {
      if (!next.some((g) => g.id === link.id)) next.push({ ...link, accepted: true });
    }
    onGeoLinksChange?.(next);
    setPendingLinks([]);
    onDirty?.();
  };

  const deletePendingDiagonals = () => {
    setPendingLinks((prev) => prev.filter((L) => !L.diagonal));
  };

  const removeGeoLink = (id) => {
    onGeoLinksChange?.((geoLinks || []).filter((g) => g.id !== id));
    onDirty?.();
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

  const hitCandidate = (norm) =>
    candidates.find((c) => Math.hypot(c.x - norm.x, c.y - norm.y) < 0.03 / zoom);

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
      grabRef.current = { id: hit.id, moved: false };
      setSelectedMapId(hit.id);
      setDragSceneId(hit.id);
      setSelectedCandidateId(null);
      return;
    }

    const cand = hitCandidate(norm);
    if (cand) {
      // Only place onto a detected dot when the user explicitly picked a photo
      // from the unplaced strip (dragSceneId). An unplaced active scene alone
      // must not steal the click — otherwise you can't select a false positive to delete.
      if (dragSceneId && placeTarget) {
        if (placeAt(placeTarget.id, cand.x, cand.y)) {
          setCandidates((prev) => prev.filter((c) => c.id !== cand.id));
        }
        return;
      }
      candidateGrabRef.current = { id: cand.id, moved: false };
      setSelectedCandidateId(cand.id);
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
    if (candidateGrabRef.current) {
      const norm = clientToNorm(e.clientX, e.clientY);
      if (!norm) return;
      const id = candidateGrabRef.current.id;
      candidateGrabRef.current.moved = true;
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, x: norm.x, y: norm.y } : c))
      );
      return;
    }
    if (!dragSceneId || !placed.some((s) => s.id === dragSceneId)) return;
    const norm = clientToNorm(e.clientX, e.clientY);
    if (norm && movePoint(dragSceneId, norm.x, norm.y) && grabRef.current) {
      grabRef.current.moved = true;
    }
  };

  const onMapPointerUp = () => {
    setPanning(false);
    panStart.current = null;
    if (candidateGrabRef.current) {
      candidateGrabRef.current = null;
      return;
    }
    if (dragSceneId && placed.some((s) => s.id === dragSceneId)) {
      setDragSceneId(null);
      const grab = grabRef.current;
      grabRef.current = null;
      if (grab && !grab.moved) onSelectScene?.(grab.id);
    }
  };

  const selected = scenes.find((s) => s.id === selectedMapId) || null;
  const pinById = useMemo(() => {
    const m = new Map();
    for (const s of placed) m.set(s.id, s);
    return m;
  }, [placed]);

  return (
    <div style={{ marginTop: 24 }}>
      <div
        className="visio-admin-section-title"
        style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}
      >
        <MapIcon size={16} /> תוכנית קומה (מפת מיני בלבד)
      </div>
      <p style={{ fontSize: 12, color: ADMIN.muted, marginBottom: 12, lineHeight: 1.6 }}>
        זיהוי נקודות וקישורים רץ מקומית (OpenCV) — הכל הצעות עד שתאשרו. שיבוץ: בחרו תמונה ואז
        לחצו על נקודה מזוהה. כיוון דיסקית = לחיצה אחת על הפתח בפנורמה (למעלה).
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
        <button
          type="button"
          className="visio-admin-btn-ghost"
          disabled={detecting || !jobId || !plan?.url}
          data-testid="plan-detect-dots"
          onClick={runDetectDots}
        >
          {detecting ? <Loader2 size={14} className="visio-spin" /> : <Scan size={14} />}
          זהה נקודות צילום
        </button>
        <button
          type="button"
          className="visio-admin-btn-ghost"
          disabled={suggesting || !jobId || placed.length < 2}
          data-testid="plan-suggest-links"
          onClick={runSuggestLinks}
        >
          {suggesting ? <Loader2 size={14} className="visio-spin" /> : <Share2 size={14} />}
          הצע קישורים
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => uploadPlan(e.target.files?.[0])}
        />
        <span
          style={{ fontSize: 12, color: ADMIN.gold, fontWeight: 600 }}
          data-testid="map-placed-count"
          data-placed={placedAllFloors.length}
          data-total={totalVisible}
        >
          מוקמו {placedAllFloors.length} / {totalVisible}
        </span>
        {candidates.length > 0 && (
          <span
            style={{ fontSize: 12, color: ADMIN.accent, fontWeight: 600 }}
            data-testid="plan-dot-count"
            data-count={candidates.length}
          >
            {candidates.length} נקודות זוהו
          </span>
        )}
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
      {assistMsg && (
        <div
          data-testid="plan-assist-msg"
          style={{ fontSize: 12, color: ADMIN.muted, marginBottom: 10 }}
        >
          {assistMsg}
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
            data-testid={`map-unplaced-${s.id}`}
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
            title={labelOf(s.id)}
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
              {labelOf(s.id)}
            </div>
          </button>
        ))}
        {unplaced.length === 0 && (
          <span style={{ fontSize: 12, color: ADMIN.muted }}>כל הסצנות על המפה</span>
        )}
      </div>

      {placeTarget && dragSceneId && (
        <div
          data-testid="map-place-hint"
          data-scene-id={placeTarget.id}
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
          לחץ על נקודה מזוהה או על התוכנית כדי למקם את {labelOf(placeTarget.id)}
        </div>
      )}
      {placeTarget && !dragSceneId && (
        <div
          style={{
            fontSize: 12,
            color: ADMIN.muted,
            marginBottom: 8,
          }}
        >
          בחרו תמונה מהרצועה למעלה ואז לחצו על נקודה מזוהה לשיבוץ · או לחצו על התוכנית ישירות
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
        data-testid="floor-plan-viewport"
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
            <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={plan.url}
              alt="floor plan"
              crossOrigin="anonymous"
              draggable={false}
              onLoad={() => {
                if (!plan?.url) return;
                loadMaskViaProxy(plan.url).then((data) => {
                  if (!data) return;
                  data._src = plan.url;
                  maskRef.current = data;
                });
              }}
              style={{
                display: "block",
                maxWidth: 640,
                maxHeight: 400,
                width: "auto",
                height: "auto",
                pointerEvents: "none",
              }}
            />
            <div
              data-testid="floor-plan-pins"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            >
              <svg
                data-testid="plan-link-overlay"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  height: "100%",
                  overflow: "visible",
                  pointerEvents: "none",
                }}
              >
                {pendingLinks.map((L) => {
                  const a = pinById.get(L.a);
                  const b = pinById.get(L.b);
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`p-${L.id}`}
                      x1={a.mapX}
                      y1={a.mapY}
                      x2={b.mapX}
                      y2={b.mapY}
                      stroke={L.diagonal ? "rgba(251,191,36,0.85)" : "rgba(96,176,240,0.9)"}
                      strokeWidth={L.diagonal ? 0.006 : 0.004}
                      strokeDasharray={L.diagonal ? "0.02 0.015" : undefined}
                    />
                  );
                })}
                {(geoLinks || []).map((L) => {
                  const a = pinById.get(L.a);
                  const b = pinById.get(L.b);
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`g-${L.id}`}
                      x1={a.mapX}
                      y1={a.mapY}
                      x2={b.mapX}
                      y2={b.mapY}
                      stroke="rgba(52,211,153,0.95)"
                      strokeWidth={0.005}
                    />
                  );
                })}
              </svg>
              {candidates.map((c) => {
                const sel = c.id === selectedCandidateId;
                const size = sel ? 14 : 11;
                return (
                  <div
                    key={c.id}
                    data-testid={`plan-candidate-${c.id}`}
                    data-x={c.x}
                    data-y={c.y}
                    title="הצעת נקודת צילום — לחצו עם תמונה נבחרת לשיבוץ, או מחקו"
                    style={{
                      position: "absolute",
                      left: `${c.x * 100}%`,
                      top: `${c.y * 100}%`,
                      width: size,
                      height: size,
                      marginLeft: -size / 2,
                      marginTop: -size / 2,
                      borderRadius: "50%",
                      background: "transparent",
                      border: sel ? "2px solid #60b0f0" : "2px solid rgba(96,176,240,0.85)",
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                      boxSizing: "border-box",
                      pointerEvents: "auto",
                      cursor: dragSceneId ? "copy" : "move",
                    }}
                  />
                );
              })}
              {placed.map((s) => {
                const isSel = s.id === selectedMapId || s.id === activeSceneId;
                const size = isSel ? 12 : 9;
                return (
                  <div
                    key={s.id}
                    data-testid={`map-pin-${s.id}`}
                    data-map-x={s.mapX}
                    data-map-y={s.mapY}
                    title={labelOf(s.id)}
                    style={{
                      position: "absolute",
                      left: `${Number(s.mapX) * 100}%`,
                      top: `${Number(s.mapY) * 100}%`,
                      width: size,
                      height: size,
                      marginLeft: -size / 2,
                      marginTop: -size / 2,
                      borderRadius: "50%",
                      background: isSel ? "#ef4444" : "rgba(255,255,255,0.9)",
                      border: "1px solid rgba(0,0,0,0.45)",
                      boxSizing: "border-box",
                      pointerEvents: "auto",
                      cursor: "pointer",
                    }}
                  />
                );
              })}
            </div>
            </div>
          </div>
        )}
      </div>

      {placeErr && (
        <div
          role="alert"
          data-testid="plan-place-error"
          style={{ marginTop: 8, fontSize: 13, color: "#f87171", fontWeight: 600 }}
        >
          {placeErr}
        </div>
      )}

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
            {labelOf(selected.id)} · מפה{" "}
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

      {selectedCandidateId && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: ADMIN.accent }}>הצעת נקודה נבחרה</span>
          <button
            type="button"
            className="visio-admin-btn-ghost"
            style={{ color: ADMIN.error }}
            data-testid="plan-delete-candidate"
            onClick={() => {
              setCandidates((prev) => prev.filter((c) => c.id !== selectedCandidateId));
              setSelectedCandidateId(null);
            }}
          >
            <Trash2 size={13} /> מחק הצעה
          </button>
          {candidates.length > 1 && (
            <button
              type="button"
              className="visio-admin-btn-ghost"
              data-testid="plan-clear-candidates"
              onClick={() => {
                setCandidates([]);
                setSelectedCandidateId(null);
              }}
            >
              נקה כל ההצעות
            </button>
          )}
        </div>
      )}

      {(pendingLinks.length > 0 || (geoLinks || []).length > 0) && (
        <div style={{ marginTop: 14 }} data-testid="plan-links-panel">
          <div className="visio-admin-section-title" style={{ fontSize: 13, marginBottom: 8 }}>
            קישורים מהתוכנית
          </div>
          {pendingLinks.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                className="visio-admin-btn-primary"
                data-testid="plan-accept-all-links"
                onClick={acceptAllPendingLinks}
              >
                אשר את כל ה־{pendingLinks.length}
              </button>
              <button
                type="button"
                className="visio-admin-btn-ghost"
                data-testid="plan-delete-diagonals"
                disabled={!pendingLinks.some((L) => L.diagonal)}
                onClick={deletePendingDiagonals}
              >
                מחק אלכסונים (
                {pendingLinks.filter((L) => L.diagonal).length})
              </button>
              <button
                type="button"
                className="visio-admin-btn-ghost"
                onClick={() => setPendingLinks([])}
              >
                דחה את כל ההצעות
              </button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
            {pendingLinks.map((L) => (
              <div
                key={L.id}
                data-testid={`plan-pending-link-${L.id}`}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 12,
                  padding: "6px 8px",
                  background: "var(--visio-input-bg)",
                  border: "1px solid var(--visio-border-subtle)",
                }}
              >
                <span style={{ flex: 1, color: ADMIN.text }}>
                  {labelOf(L.a)} ↔ {labelOf(L.b)}
                  {L.diagonal ? (
                    <span style={{ color: ADMIN.gold, marginInlineStart: 6 }}>אלכסון</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="visio-admin-btn-ghost"
                  style={{ padding: "4px 8px" }}
                  onClick={() => acceptLink(L)}
                >
                  אשר
                </button>
                <button
                  type="button"
                  className="visio-admin-btn-ghost"
                  style={{ color: ADMIN.error, padding: 6 }}
                  onClick={() => setPendingLinks((prev) => prev.filter((x) => x.id !== L.id))}
                  aria-label="מחק הצעה"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {(geoLinks || []).map((L) => (
              <div
                key={L.id}
                data-testid={`plan-geo-link-${L.id}`}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 12,
                  padding: "6px 8px",
                  background: "rgba(52,211,153,0.08)",
                  border: "1px solid rgba(52,211,153,0.35)",
                }}
              >
                <span style={{ flex: 1, color: ADMIN.text }}>
                  ✓ {labelOf(L.a)} ↔ {labelOf(L.b)}
                </span>
                <button
                  type="button"
                  className="visio-admin-btn-ghost"
                  style={{ color: ADMIN.error, padding: 6 }}
                  onClick={() => removeGeoLink(L.id)}
                  aria-label="מחק קישור"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
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
