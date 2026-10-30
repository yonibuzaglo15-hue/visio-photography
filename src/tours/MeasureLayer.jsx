"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildWallTriangles,
  distance,
  formatMeters,
  measureHit,
  worldToYawPitch,
  yawPitchToCss,
} from "../../lib/tour/measure.js";

function hintText(model, pending, miss, hasPose) {
  if (!hasPose) return "בנקודה הזו אין נתוני מדידה";
  if (miss) return "לא נמצא משטח כאן";
  if (pending) return "לחצו נקודה שנייה";
  if (model.mode === "floor") return "שתי נקודות על הרצפה · הערכה בלבד";
  if (model.mode === "surfaces") return "שתי נקודות על רצפה או קיר · הערכה בלבד";
  return "";
}

export default function MeasureLayer({ active, model, viewerRef, panoRef, sceneId, ready, onClose }) {
  const triangles = useMemo(
    () =>
      model?.mode === "surfaces"
        ? buildWallTriangles(model.walls, -0.2, model.ceilingZ ?? 2.85)
        : [],
    [model],
  );
  const [segments, setSegments] = useState([]);
  const [pending, setPending] = useState(null);
  const [hover, setHover] = useState(null);
  const [miss, setMiss] = useState(false);
  const [frame, setFrame] = useState(null);
  const pendingRef = useRef(null);
  const dragRef = useRef(null);
  const idRef = useRef(1);

  const pose = model?.scenes?.[sceneId] || null;

  function rememberPending(point) {
    pendingRef.current = point;
    setPending(point);
  }

  function clearAll() {
    rememberPending(null);
    setHover(null);
    setSegments([]);
  }

  useEffect(() => {
    if (!active) {
      rememberPending(null);
      setHover(null);
    }
  }, [active]);

  useEffect(() => {
    if (!miss) return undefined;
    const timer = setTimeout(() => setMiss(false), 1600);
    return () => clearTimeout(timer);
  }, [miss]);

  useEffect(() => {
    if (!active) return undefined;
    function onKey(event) {
      if (event.key !== "Escape") return;
      if (pendingRef.current) {
        rememberPending(null);
        return;
      }
      onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);

  useEffect(() => {
    const el = panoRef.current;
    if (!active || !el || !ready) return undefined;

    function hitAt(event) {
      const viewer = viewerRef.current;
      if (!viewer || !pose) return null;
      const coords = viewer.mouseEventToCoords(event);
      if (!coords) return null;
      return measureHit(model, pose, coords[1], coords[0], triangles);
    }

    function onDown(event) {
      if (event.button != null && event.button !== 0) return;
      dragRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    }

    function onMove(event) {
      if (!pose) return;
      setHover(hitAt(event));
    }

    function onUp(event) {
      const start = dragRef.current;
      dragRef.current = null;
      if (!start || start.id !== event.pointerId || !pose) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (dx * dx + dy * dy > 64) return;
      const hit = hitAt(event);
      if (!hit) {
        setMiss(true);
        return;
      }
      setMiss(false);
      const current = pendingRef.current;
      if (!current) {
        rememberPending(hit);
        return;
      }
      const meters = distance(current, hit);
      if (meters >= 0.05) {
        const id = idRef.current;
        idRef.current += 1;
        setSegments((list) => [...list, { id, a: current, b: hit, meters }]);
      }
      rememberPending(null);
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
  }, [active, ready, model, pose, triangles, panoRef, viewerRef]);

  useEffect(() => {
    if (!ready || (!active && segments.length === 0)) return undefined;
    let frameId = 0;
    const tick = () => {
      const viewer = viewerRef.current;
      const pano = panoRef.current;
      if (viewer && pano) {
        const rect = pano.getBoundingClientRect();
        const next = {
          yaw: viewer.getYaw(),
          pitch: viewer.getPitch(),
          hfov: viewer.getHfov(),
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
        };
        setFrame((prev) => {
          if (
            prev &&
            prev.yaw === next.yaw &&
            prev.pitch === next.pitch &&
            prev.hfov === next.hfov &&
            prev.width === next.width &&
            prev.height === next.height
          ) {
            return prev;
          }
          return next;
        });
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [ready, active, segments.length, sceneId, viewerRef, panoRef]);

  function project(point) {
    if (!pose || !frame) return null;
    const ang = worldToYawPitch(pose, point);
    const css = yawPitchToCss(
      ang.yaw,
      ang.pitch,
      frame.yaw,
      frame.pitch,
      frame.hfov,
      frame.width,
      frame.height,
    );
    if (!css) return null;
    return { x: frame.left + css.x, y: frame.top + css.y };
  }

  if (!model || (!active && segments.length === 0)) return null;

  const lines = [];
  for (const segment of segments) {
    const a = project(segment.a);
    const b = project(segment.b);
    if (a && b) lines.push({ ...segment, a, b });
  }
  const pendingCss = pending ? project(pending) : null;
  const hoverCss = active && pending && hover ? project(hover) : null;
  const draftMeters = pending && hover ? distance(pending, hover) : null;
  const last = segments[segments.length - 1];

  return (
    <>
      <div className="visio-tour-measure">
        <svg>
          {lines.map((line) => (
            <g key={line.id}>
              <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} />
              <circle cx={line.a.x} cy={line.a.y} r="5" />
              <circle cx={line.b.x} cy={line.b.y} r="5" />
            </g>
          ))}
          {pendingCss && hoverCss && (
            <line
              className="is-draft"
              x1={pendingCss.x}
              y1={pendingCss.y}
              x2={hoverCss.x}
              y2={hoverCss.y}
            />
          )}
          {pendingCss && <circle cx={pendingCss.x} cy={pendingCss.y} r="5" />}
        </svg>
        {lines.map((line) => (
          <div
            key={line.id}
            className="visio-tour-measure-label"
            data-testid="measure-label"
            style={{ left: (line.a.x + line.b.x) / 2, top: (line.a.y + line.b.y) / 2 }}
            dir="ltr"
          >
            {formatMeters(line.meters)}
          </div>
        ))}
        {pendingCss && hoverCss && draftMeters >= 0.05 && (
          <div
            className="visio-tour-measure-label is-draft"
            style={{ left: (pendingCss.x + hoverCss.x) / 2, top: (pendingCss.y + hoverCss.y) / 2 }}
            dir="ltr"
          >
            {formatMeters(draftMeters)}
          </div>
        )}
      </div>
      {active && (
        <div className="visio-tour-measure-bar" role="status">
          <span>{hintText(model, pending, miss, Boolean(pose))}</span>
          {last && (
            <strong dir="ltr" data-testid="measure-latest">
              {formatMeters(last.meters)}
            </strong>
          )}
          {(segments.length > 0 || pending) && (
            <button type="button" className="visio-tour-measure-clear" onClick={clearAll}>
              נקה
            </button>
          )}
        </div>
      )}
    </>
  );
}
