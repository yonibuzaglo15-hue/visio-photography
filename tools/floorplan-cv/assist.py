#!/usr/bin/env python3
"""
Local floor-plan assistant (OpenCV). No network, no API keys.

Commands:
  detect <image>              → JSON dots (normalized 0–1)
  suggest-links <image> -     → JSON links; positions via stdin JSON

Stdout is always a single JSON object. Suggestions only — callers confirm.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import cv2
import numpy as np


def _apartment_mask(gray: np.ndarray) -> np.ndarray:
    """True on apartment pixels (not the dark Matterport chrome)."""
    return gray >= 40


def detect_dots(image_bgr: np.ndarray) -> list[dict[str, Any]]:
    """
    Find Matterport-style capture rings on a cropped plan.
    Tuned for soft white concentric rings; furniture circles may slip through
    (UI must let the user delete them in one click).
    """
    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    apt = _apartment_mask(gray)
    blur = cv2.GaussianBlur(gray, (5, 5), 1.2)
    raw = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=12,
        param1=80,
        param2=18,
        minRadius=4,
        maxRadius=14,
    )
    if raw is None:
        return []

    circles = np.round(raw[0]).astype(int)

    def ring_score(cx: int, cy: int, r: int) -> float | None:
        yy, xx = np.ogrid[:h, :w]
        dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        center = gray[(dist <= max(1.0, r * 0.35)) & apt]
        ring = gray[(dist >= r * 0.55) & (dist <= r * 1.15) & apt]
        if center.size < 3 or ring.size < 8:
            return None
        return float(ring.mean())

    kept: list[tuple[int, int, int, float]] = []
    for cx, cy, r in circles:
        if not (0 <= cx < w and 0 <= cy < h) or not apt[cy, cx]:
            continue
        rm = ring_score(int(cx), int(cy), int(r))
        if rm is None or rm < 85:
            continue
        kept.append((int(cx), int(cy), int(r), rm))

    # Prefer brighter / larger rings when two detections collide.
    kept.sort(key=lambda t: (-t[3], -t[2]))
    final: list[tuple[int, int, int, float]] = []
    for c in kept:
        if any((c[0] - f[0]) ** 2 + (c[1] - f[1]) ** 2 < 11**2 for f in final):
            continue
        final.append(c)

    dots = []
    for i, (cx, cy, r, rm) in enumerate(final):
        dots.append(
            {
                "id": f"dot_{i}",
                "x": round(cx / w, 6),
                "y": round(cy / h, 6),
                "rNorm": round(r / max(w, h), 6),
                "px": {"x": cx, "y": cy, "r": r},
                "score": round(rm, 2),
            }
        )
    return dots


def wall_mask(gray: np.ndarray) -> np.ndarray:
    """Binary wall strokes (bright lines on the plan), lightly dilated for LOS tests."""
    apt = _apartment_mask(gray)
    # Bright white Matterport wall outlines — keep only strong strokes.
    walls = ((gray > 200) & apt).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    walls = cv2.morphologyEx(walls, cv2.MORPH_OPEN, k)
    # 1px dilate so thin gaps still block LOS without flooding rooms.
    walls = cv2.dilate(walls, k, iterations=1)
    return walls


def _bresenham(x0: int, y0: int, x1: int, y1: int):
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    x, y = x0, y0
    while True:
        yield x, y
        if x == x1 and y == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x += sx
        if e2 <= dx:
            err += dx
            y += sy


def line_crosses_wall(
    walls: np.ndarray, x0: int, y0: int, x1: int, y1: int, skip_ends: int = 4
) -> bool:
    h, w = walls.shape
    pts = list(_bresenham(x0, y0, x1, y1))
    if len(pts) <= skip_ends * 2 + 2:
        mid = pts[len(pts) // 2]
        return walls[mid[1], mid[0]] > 0
    for x, y in pts[skip_ends:-skip_ends]:
        if 0 <= x < w and 0 <= y < h and walls[y, x] > 0:
            return True
    return False


def doorway_near_segment(
    walls: np.ndarray, x0: int, y0: int, x1: int, y1: int, search: int = 8
) -> bool:
    """
    Prefer pairs that pass near a wall gap (doorway). Same-room short hops with
    clear LOS are also allowed so adjacent capture points still link.
    """
    h, w = walls.shape
    dist = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
    # Adjacent points in the same open room — always OK if LOS already clear.
    if dist < min(w, h) * 0.14:
        return True
    pts = list(_bresenham(x0, y0, x1, y1))
    if len(pts) < 8:
        return True
    a = len(pts) // 3
    b = (2 * len(pts)) // 3
    wall_hits = 0
    gap_hits = 0
    for x, y in pts[a:b]:
        local_wall = False
        for dy in range(-search, search + 1):
            for dx in range(-search, search + 1):
                if dx * dx + dy * dy > search * search:
                    continue
                xx, yy = x + dx, y + dy
                if 0 <= xx < w and 0 <= yy < h and walls[yy, xx] > 0:
                    local_wall = True
                    break
            if local_wall:
                break
        if local_wall:
            wall_hits += 1
        else:
            gap_hits += 1
    return gap_hits > 0 and wall_hits > 0


def suggest_links(
    image_bgr: np.ndarray, positions: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    positions: [{id, x, y}] normalized.
    Link if LOS clear of walls AND (doorway-ish OR short same-room).
    """
    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    walls = wall_mask(gray)
    pts = []
    for p in positions:
        pid = p.get("id")
        x = float(p["x"])
        y = float(p["y"])
        if not pid or not (0 <= x <= 1 and 0 <= y <= 1):
            continue
        pts.append((str(pid), int(round(x * w)), int(round(y * h)), x, y))

    links = []
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            a_id, ax, ay, anx, any_ = pts[i]
            b_id, bx, by, bnx, bny = pts[j]
            dist_px = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5
            dist_norm = ((bnx - anx) ** 2 + (bny - any_) ** 2) ** 0.5
            if dist_px < 8:
                continue
            if dist_norm > 0.55:
                continue  # hard cap — long diagonals across the plan
            if line_crosses_wall(walls, ax, ay, bx, by):
                continue
            if not doorway_near_segment(walls, ax, ay, bx, by):
                continue
            diagonal = dist_norm > 0.22
            links.append(
                {
                    "id": f"link_{a_id}_{b_id}",
                    "a": a_id,
                    "b": b_id,
                    "distNorm": round(dist_norm, 5),
                    "diagonal": diagonal,
                }
            )
    links.sort(key=lambda L: L["distNorm"])
    return links


def main() -> int:
    parser = argparse.ArgumentParser(description="Local floor-plan CV assistant")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_det = sub.add_parser("detect")
    p_det.add_argument("image")

    p_link = sub.add_parser("suggest-links")
    p_link.add_argument("image")
    p_link.add_argument(
        "positions_json",
        nargs="?",
        default="-",
        help="JSON file of [{id,x,y}] or '-' for stdin",
    )

    args = parser.parse_args()
    img = cv2.imread(args.image)
    if img is None:
        print(json.dumps({"ok": False, "error": f"cannot read image: {args.image}"}))
        return 1

    h, w = img.shape[:2]
    if args.cmd == "detect":
        dots = detect_dots(img)
        print(
            json.dumps(
                {
                    "ok": True,
                    "width": w,
                    "height": h,
                    "dotCount": len(dots),
                    "dots": dots,
                },
                ensure_ascii=False,
            )
        )
        return 0

    if args.cmd == "suggest-links":
        raw = sys.stdin.read() if args.positions_json == "-" else open(args.positions_json).read()
        try:
            positions = json.loads(raw)
        except json.JSONDecodeError as e:
            print(json.dumps({"ok": False, "error": f"bad positions JSON: {e}"}))
            return 1
        if isinstance(positions, dict):
            positions = positions.get("positions") or positions.get("points") or []
        links = suggest_links(img, positions)
        print(
            json.dumps(
                {
                    "ok": True,
                    "width": w,
                    "height": h,
                    "linkCount": len(links),
                    "links": links,
                    "diagonalCount": sum(1 for L in links if L.get("diagonal")),
                },
                ensure_ascii=False,
            )
        )
        return 0

    print(json.dumps({"ok": False, "error": "unknown command"}))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
