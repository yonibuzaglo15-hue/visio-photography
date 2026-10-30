"use client";

import { useEffect, useMemo, useState } from "react";
import { buildWallTriangles, formatMeters, viewForward, worldToYawPitch, yawPitchToCss } from "../../lib/tour/measure.js";
import { roomChip, roomForScene } from "../../lib/tour/room-dims.js";
import { visibleWallSegments } from "../../lib/tour/wall-view.js";

function projectPoint(pose, point, frame) {
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

/** Portion of a screen segment inside the panorama. */
function clipToScreen(a, b, frame) {
  const left = frame.left;
  const top = frame.top;
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  let x0 = a.x;
  let y0 = a.y;
  let x1 = b.x;
  let y1 = b.y;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-8) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, x0 - left)) return null;
  if (!clip(dx, right - x0)) return null;
  if (!clip(-dy, y0 - top)) return null;
  if (!clip(dy, bottom - y0)) return null;
  if (t1 - t0 < 0.02) return null;
  return {
    a: { x: x0 + dx * t0, y: y0 + dy * t0 },
    b: { x: x0 + dx * t1, y: y0 + dy * t1 },
  };
}

function ticks(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { px: (-dy / len) * 7, py: (dx / len) * 7 };
}

function clipToView(pose, a, b, viewYaw) {
  const fa = viewForward(pose, a, viewYaw);
  const fb = viewForward(pose, b, viewYaw);
  if (fa < 0.35 && fb < 0.35) return null;
  if (fa >= 0.35 && fb >= 0.35) return [a, b];
  const t = (0.4 - fa) / ((fb - fa) || 1e-6);
  const p = a.map((value, index) => value + t * (b[index] - value));
  return fa >= 0.35 ? [a, p] : [p, b];
}

export default function AutoDimensions({ model, sceneId, sceneTitle, viewerRef, panoRef, ready, visible }) {
  const [frame, setFrame] = useState(null);
  const room = roomForScene(model, sceneId);
  const pose = model?.scenes?.[sceneId] || null;
  const triangles = useMemo(
    () => (model?.walls ? buildWallTriangles(model.walls, -0.25, model.ceilingZ || 2.85) : []),
    [model],
  );

  useEffect(() => {
    if (!ready || !visible || !pose) return undefined;
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
  }, [ready, visible, pose, sceneId, viewerRef, panoRef]);

  if (!visible || !pose || !frame || !model?.walls) return null;

  const segments = visibleWallSegments(
    pose,
    model.walls,
    triangles,
    (point) => viewForward(pose, point, frame.yaw),
  );
  const drawn = [];
  const labels = [];
  for (const segment of segments) {
    const clipped = clipToView(pose, segment.a, segment.b, frame.yaw);
    if (!clipped) continue;
    const a0 = projectPoint(pose, clipped[0], frame);
    const b0 = projectPoint(pose, clipped[1], frame);
    if (!a0 || !b0) continue;
    const onScreen = clipToScreen(a0, b0, frame);
    if (!onScreen) continue;
    const { a, b } = onScreen;
    const screen = Math.hypot(b.x - a.x, b.y - a.y);
    if (screen < 36) continue;
    drawn.push({ a, b, tick: ticks(a, b), meters: segment.meters });
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!labels.some((label) => Math.hypot(label.x - mid.x, label.y - mid.y) < 46)) {
      labels.push({ ...mid, text: formatMeters(segment.meters), kind: "wall" });
    }
    for (const opening of segment.openings) {
      const at = projectPoint(pose, opening.at, frame);
      if (!at) continue;
      if (labels.some((label) => Math.hypot(label.x - at.x, label.y - at.y) < 46)) continue;
      labels.push({ ...at, text: formatMeters(opening.width), kind: "opening" });
    }
  }

  const chip = roomChip(room, sceneTitle);
  if (!drawn.length && !chip) return null;

  return (
    <>
      <div className="visio-tour-autodim" data-testid="auto-dims">
        <svg>
          {drawn.map((line) => (
            <g key={`${line.a.x.toFixed(0)}-${line.b.x.toFixed(0)}-${line.meters}`}>
              <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} />
              <line x1={line.a.x - line.tick.px} y1={line.a.y - line.tick.py} x2={line.a.x + line.tick.px} y2={line.a.y + line.tick.py} />
              <line x1={line.b.x - line.tick.px} y1={line.b.y - line.tick.py} x2={line.b.x + line.tick.px} y2={line.b.y + line.tick.py} />
            </g>
          ))}
        </svg>
        {labels.map((label) => (
          <div
            key={`${label.kind}-${label.x.toFixed(0)}-${label.y.toFixed(0)}`}
            className="visio-tour-measure-label is-auto"
            data-testid="auto-dim-label"
            style={{ left: label.x, top: label.y }}
            dir="ltr"
          >
            {label.text}
          </div>
        ))}
      </div>
      {chip && (chip.sizeLabel || chip.height) && (
        <div className="visio-tour-autodim-chip" data-testid="auto-dim-chip" dir="rtl">
          {chip.title && <span>{chip.title}</span>}
          {chip.sizeLabel && <strong dir="ltr">{chip.sizeLabel}</strong>}
          {chip.height && <span dir="ltr">{chip.height}</span>}
        </div>
      )}
    </>
  );
}
