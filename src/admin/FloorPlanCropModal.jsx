"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ADMIN } from "./theme.js";
import {
  assertCropAcceptable,
  cropImageToBlob,
  detectContentBounds,
} from "../../lib/tour/floor-plan-crop.js";
import { MIN_CONTENT_RATIO } from "../../lib/tour/floor-plan.js";

/**
 * Crop confirmation UI after floor-plan upload / re-crop.
 * crop = { x, y, w, h } normalized to the source image.
 */
export default function FloorPlanCropModal({
  source, // File | Blob | string URL
  initialCrop,
  detection,
  onCancel,
  onConfirm, // ({ crop, blob }) => void
}) {
  const [crop, setCrop] = useState(
    () =>
      initialCrop || {
        x: detection?.x ?? 0.1,
        y: detection?.y ?? 0.1,
        w: detection?.w ?? 0.8,
        h: detection?.h ?? 0.8,
      }
  );
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(null);
  const stageRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (detection) {
      setCrop({
        x: detection.x,
        y: detection.y,
        w: detection.w,
        h: detection.h,
      });
    }
  }, [detection]);

  const clientToNorm = useCallback((clientX, clientY) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const onPointerDown = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const n = clientToNorm(e.clientX, e.clientY);
    if (!n) return;
    setDrag({
      mode, // move | nw | ne | sw | se | new
      start: n,
      orig: { ...crop },
    });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const n = clientToNorm(e.clientX, e.clientY);
    if (!n) return;
    const { mode, start, orig } = drag;
    if (mode === "move") {
      const dx = n.x - start.x;
      const dy = n.y - start.y;
      let x = orig.x + dx;
      let y = orig.y + dy;
      x = Math.min(Math.max(0, x), 1 - orig.w);
      y = Math.min(Math.max(0, y), 1 - orig.h);
      setCrop({ ...orig, x, y });
      return;
    }
    if (mode === "new") {
      const x = Math.min(start.x, n.x);
      const y = Math.min(start.y, n.y);
      const w = Math.abs(n.x - start.x);
      const h = Math.abs(n.y - start.y);
      setCrop({ x, y, w: Math.max(0.05, w), h: Math.max(0.05, h) });
      return;
    }
    // corner resize
    let { x, y, w, h } = orig;
    if (mode.includes("w")) {
      const right = orig.x + orig.w;
      x = Math.min(n.x, right - 0.05);
      w = right - x;
    }
    if (mode.includes("e")) {
      w = Math.max(0.05, n.x - orig.x);
    }
    if (mode.includes("n")) {
      const bottom = orig.y + orig.h;
      y = Math.min(n.y, bottom - 0.05);
      h = bottom - y;
    }
    if (mode.includes("s")) {
      h = Math.max(0.05, n.y - orig.y);
    }
    x = Math.min(Math.max(0, x), 1 - 0.05);
    y = Math.min(Math.max(0, y), 1 - 0.05);
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    setCrop({ x, y, w, h });
  };

  const onPointerUp = () => setDrag(null);

  const confirm = async () => {
    setErr("");
    const check = assertCropAcceptable(crop, detection);
    if (!check.ok) {
      setErr(check.error);
      return;
    }
    setBusy(true);
    try {
      const blob = await cropImageToBlob(source, crop);
      await onConfirm({ crop, blob });
    } catch (e) {
      setErr(e.message || "חיתוך נכשל");
    } finally {
      setBusy(false);
    }
  };

  const contentPct = Math.round((detection?.contentRatio ?? 0) * 100);
  const needsCrop = Boolean(detection?.needsCrop);

  const srcUrl =
    typeof source === "string"
      ? source
      : source instanceof Blob
        ? URL.createObjectURL(source)
        : null;

  useEffect(() => {
    return () => {
      if (srcUrl && typeof source !== "string") URL.revokeObjectURL(srcUrl);
    };
  }, [srcUrl, source]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        direction: "rtl",
      }}
    >
      <div
        style={{
          width: "min(920px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          background: "var(--visio-panel, #141414)",
          border: "1px solid var(--visio-border-subtle)",
          borderRadius: 2,
          padding: 20,
        }}
      >
        <div className="visio-admin-section-title" style={{ marginBottom: 8 }}>
          חיתוך תוכנית קומה
        </div>
        <p style={{ fontSize: 13, color: ADMIN.muted, lineHeight: 1.7, marginBottom: 12 }}>
          גרור את המסגרת כך שתכסה רק את תוכנית הקומה (בלי כרום הדפדפן והרקע השחור).
          {needsCrop && (
            <span style={{ color: ADMIN.error, display: "block", marginTop: 6 }}>
              זוהתה תוכנית שתופסת רק ~{contentPct}% מהתמונה (מתחת ל־
              {Math.round(MIN_CONTENT_RATIO * 100)}%). חובה לחתוך לפני המשך.
            </span>
          )}
        </p>

        <div
          ref={stageRef}
          style={{
            position: "relative",
            background: "#0a0a0a",
            border: "1px solid var(--visio-border-subtle)",
            userSelect: "none",
            touchAction: "none",
            display: "flex",
            justifyContent: "center",
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={srcUrl}
              alt="crop source"
              draggable={false}
              onLoad={(e) =>
                setImgSize({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
              onPointerDown={(e) => onPointerDown(e, "new")}
              style={{ display: "block", maxWidth: "100%", maxHeight: "58vh", height: "auto" }}
            />
            <div
              style={{
                position: "absolute",
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
                border: "2px solid #c9a84c",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                cursor: "move",
              }}
              onPointerDown={(e) => onPointerDown(e, "move")}
            >
              {["nw", "ne", "sw", "se"].map((corner) => (
                <div
                  key={corner}
                  onPointerDown={(e) => onPointerDown(e, corner)}
                  style={{
                    position: "absolute",
                    width: 14,
                    height: 14,
                    background: "#c9a84c",
                    border: "1px solid #0a0a0a",
                    cursor: `${corner}-resize`,
                    ...(corner.includes("n") ? { top: -7 } : { bottom: -7 }),
                    ...(corner.includes("w") ? { left: -7 } : { right: -7 }),
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {err && (
          <div className="visio-admin-error" style={{ marginTop: 12 }}>{err}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" className="visio-admin-btn-ghost" onClick={onCancel} disabled={busy}>
            ביטול
          </button>
          <button type="button" className="visio-admin-btn-primary" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 size={14} className="visio-spin" /> : null}
            {" "}אשר חיתוך ושמור
          </button>
        </div>
        <div style={{ fontSize: 11, color: ADMIN.muted, marginTop: 8 }} dir="ltr">
          {imgSize.w}×{imgSize.h} · crop {(crop.w * 100).toFixed(0)}%×{(crop.h * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}

/** Helper: open crop flow from a File or existing plan URL. */
export async function prepareCropSession(source) {
  const detection = await detectContentBounds(source);
  return {
    source,
    detection,
    initialCrop: {
      x: detection.x,
      y: detection.y,
      w: detection.w,
      h: detection.h,
    },
  };
}
