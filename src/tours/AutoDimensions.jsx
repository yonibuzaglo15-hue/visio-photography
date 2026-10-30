"use client";

import { useEffect, useState } from "react";
import { roomChip, roomForScene } from "../../lib/tour/room-dims.js";
import { formatMeters, worldToYawPitch, yawPitchToCss } from "../../lib/tour/measure.js";

function projectPoint(pose, point, frame) {
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

function ticks(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * 8;
  const py = (dx / len) * 8;
  return { px, py };
}

export default function AutoDimensions({ model, sceneId, sceneTitle, viewerRef, panoRef, ready, visible }) {
  const [frame, setFrame] = useState(null);
  const room = visible ? roomForScene(model, sceneId) : null;
  const pose = model?.scenes?.[sceneId] || null;

  useEffect(() => {
    if (!ready || !visible || !room) return undefined;
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
  }, [ready, visible, room, sceneId, viewerRef, panoRef]);

  if (!room) return null;
  const chip = roomChip(room, sceneTitle);
  const lines = (room.lines || [])
    .map((line) => {
      const a = projectPoint(pose, line.a, frame);
      const b = projectPoint(pose, line.b, frame);
      if (!a || !b) return null;
      return { ...line, a, b, tick: ticks(a, b) };
    })
    .filter(Boolean);

  return (
    <>
      <div className="visio-tour-autodim" data-testid="auto-dims">
        <svg>
          {lines.map((line) => (
            <g key={`${line.a.x}-${line.b.x}`}>
              <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} />
              <line x1={line.a.x - line.tick.px} y1={line.a.y - line.tick.py} x2={line.a.x + line.tick.px} y2={line.a.y + line.tick.py} />
              <line x1={line.b.x - line.tick.px} y1={line.b.y - line.tick.py} x2={line.b.x + line.tick.px} y2={line.b.y + line.tick.py} />
            </g>
          ))}
        </svg>
        {lines.map((line) => (
          <div
            key={`l-${line.meters}-${line.a.x}`}
            className="visio-tour-measure-label is-auto"
            data-testid="auto-dim-label"
            style={{ left: (line.a.x + line.b.x) / 2, top: (line.a.y + line.b.y) / 2 }}
            dir="ltr"
          >
            {formatMeters(line.meters)}
          </div>
        ))}
      </div>
      {chip && (
        <div className="visio-tour-autodim-chip" data-testid="auto-dim-chip" dir="rtl">
          {chip.title && <span>{chip.title}</span>}
          <strong dir="ltr">{chip.sizeLabel}</strong>
          {chip.area && <span dir="ltr">{chip.area}</span>}
          {chip.height && <span dir="ltr">{chip.height}</span>}
        </div>
      )}
    </>
  );
}
