"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { friendlyRoomLabel, mapBearing } from "../../lib/tour/floor-plan.js";

/**
 * Matterport-style mini-map for the public tour viewer.
 * Hidden when no floor plan is present.
 * Pass debug=true (or ?debug=1) to draw disc-direction arrows.
 */
export default function TourMiniMap({
  floorPlans = [],
  scenes = {},
  currentSceneId,
  yaw = 0,
  onJump,
  debug = false,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeFloor, setActiveFloor] = useState(null);

  const plans = Array.isArray(floorPlans) ? floorPlans : [];
  const plan =
    plans.find((p) => Number(p.floor) === Number(activeFloor)) || plans[0] || null;

  useEffect(() => {
    if (!plan && plans[0]) setActiveFloor(plans[0].floor);
  }, [plans, plan]);

  const points = useMemo(() => {
    const floor = plan?.floor ?? 0;
    return Object.entries(scenes || {})
      .filter(([, sc]) => {
        if (!sc || sc.hidden) return false;
        if (!Number.isFinite(Number(sc.mapX)) || !Number.isFinite(Number(sc.mapY))) {
          return false;
        }
        return (sc.floor ?? 0) === floor;
      })
      .map(([id, sc]) => ({
        id,
        mapX: Number(sc.mapX),
        mapY: Number(sc.mapY),
        northOffset: Number.isFinite(Number(sc.northOffset))
          ? Number(sc.northOffset)
          : 0,
        title: friendlyRoomLabel({ title: sc.title, id }),
        hotSpots: sc.hotSpots || [],
      }));
  }, [scenes, plan]);

  const debugArrows = useMemo(() => {
    // Only draw after client mount with debug=true (avoids SSR/client <line> mismatch).
    if (!debug || !currentSceneId) return [];
    const from = points.find((p) => p.id === currentSceneId);
    if (!from) return [];
    const byId = new Map(points.map((p) => [p.id, p]));
    const arrows = [];
    for (const h of from.hotSpots || []) {
      const toId = h.targetSceneId || h.sceneId;
      const to = byId.get(toId);
      if (!to) continue;
      const bearing = mapBearing(from.mapX, from.mapY, to.mapX, to.mapY);
      arrows.push({
        key: `${from.id}-${toId}`,
        x1: from.mapX * 100,
        y1: from.mapY * 100,
        x2: from.mapX * 100 + Math.sin((bearing * Math.PI) / 180) * 8,
        y2: from.mapY * 100 - Math.cos((bearing * Math.PI) / 180) * 8,
        label: to.title,
        yaw: Number(h.yaw),
      });
    }
    return arrows;
  }, [debug, currentSceneId, points]);

  if (!plans.length || !plan) return null;

  const current = points.find((p) => p.id === currentSceneId);
  // Viewing direction on map: panorama yaw + northOffset = map bearing
  const coneDeg = current
    ? (yaw || 0) + (current.northOffset || 0)
    : 0;

  const size = expanded ? 280 : 148;

  return (
    <div
      className="visio-tour-minimap"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 40,
        direction: "ltr",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 6,
          marginBottom: 6,
        }}
      >
        {plans.length > 1 &&
          plans.map((p) => (
            <button
              key={p.floor}
              type="button"
              onClick={() => setActiveFloor(p.floor)}
              style={{
                border: "none",
                background:
                  Number(p.floor) === Number(plan.floor)
                    ? "rgba(201,168,76,0.95)"
                    : "rgba(20,20,20,0.75)",
                color:
                  Number(p.floor) === Number(plan.floor) ? "#0a0a0a" : "#ddd",
                fontSize: 10,
                padding: "4px 8px",
                borderRadius: 2,
                cursor: "pointer",
              }}
            >
              {p.label || `F${p.floor}`}
            </button>
          ))}
        <button
          type="button"
          aria-label={collapsed ? "הצג מפה" : "כווץ מפה"}
          onClick={() => setCollapsed((c) => !c)}
          style={{
            border: "none",
            background: "rgba(20,20,20,0.8)",
            color: "#c9a84c",
            width: 28,
            height: 28,
            borderRadius: 2,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {!collapsed && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            display: "block",
            width: size,
            height: size,
            padding: 0,
            border: "1px solid rgba(201,168,76,0.45)",
            borderRadius: 4,
            overflow: "hidden",
            background: "#141414",
            cursor: "pointer",
            position: "relative",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
          title="הקש להגדלה · לחץ על נקודה למעבר"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={plan.url}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              pointerEvents: "none",
              opacity: 0.92,
            }}
          />
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <defs>
              <marker
                id="visio-debug-arrow"
                markerWidth="4"
                markerHeight="4"
                refX="3"
                refY="2"
                orient="auto"
              >
                <path d="M0,0 L4,2 L0,4 Z" fill="#60b0f0" />
              </marker>
            </defs>
            {debugArrows.map((a) => (
              <g key={a.key}>
                <line
                  x1={a.x1}
                  y1={a.y1}
                  x2={a.x2}
                  y2={a.y2}
                  stroke="#60b0f0"
                  strokeWidth={0.7}
                  markerEnd="url(#visio-debug-arrow)"
                />
              </g>
            ))}
            {points.map((p) => {
              const isCurrent = p.id === currentSceneId;
              return (
                <g key={p.id}>
                  {isCurrent && (
                    <polygon
                      points="0,-5.5 3.2,3.5 -3.2,3.5"
                      fill="rgba(201,168,76,0.95)"
                      stroke="#0a0a0a"
                      strokeWidth={0.3}
                      transform={`translate(${p.mapX * 100} ${p.mapY * 100}) rotate(${coneDeg})`}
                    />
                  )}
                  <circle
                    cx={p.mapX * 100}
                    cy={p.mapY * 100}
                    r={isCurrent ? 2.2 : 1.5}
                    fill={isCurrent ? "#ef4444" : "rgba(255,255,255,0.8)"}
                    stroke="rgba(0,0,0,0.4)"
                    strokeWidth={0.25}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (p.id !== currentSceneId) onJump?.(p.id);
                    }}
                  >
                    <title>{p.title}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
          {debug && (
            <div
              style={{
                position: "absolute",
                top: 4,
                left: 4,
                fontSize: 9,
                color: "#60b0f0",
                background: "rgba(0,0,0,0.65)",
                padding: "2px 5px",
                borderRadius: 2,
                pointerEvents: "none",
              }}
            >
              debug
            </div>
          )}
          <div
            style={{
              position: "absolute",
              bottom: 4,
              left: 4,
              right: 4,
              display: "flex",
              alignItems: "center",
              gap: 4,
              pointerEvents: "none",
            }}
          >
            <MapIconFallback />
            <span
              style={{
                fontSize: 10,
                color: "#eee",
                textShadow: "0 1px 2px #000",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {current?.title || "מפה"}
            </span>
          </div>
        </button>
      )}
    </div>
  );
}

function MapIconFallback() {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: 2,
        background: "rgba(201,168,76,0.9)",
        flexShrink: 0,
      }}
    />
  );
}
