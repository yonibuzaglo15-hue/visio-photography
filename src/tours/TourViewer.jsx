"use client";

import { useEffect, useRef, useState } from "react";
import AutoDimensions from "./AutoDimensions";
import MeasureLayer from "./MeasureLayer";
import "./tour.css";

const PANNELLUM_SRC = "/vendor/pannellum/pannellum.js";

function ensurePannellum() {
  if (typeof window !== "undefined" && window.pannellum?.viewer) {
    return Promise.resolve(window.pannellum);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PANNELLUM_SRC}"]`);
    const done = () => {
      if (window.pannellum?.viewer) resolve(window.pannellum);
      else reject(new Error("pannellum missing viewer"));
    };
    if (existing) {
      if (window.pannellum?.viewer) {
        resolve(window.pannellum);
        return;
      }
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", () => reject(new Error("pannellum failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = PANNELLUM_SRC;
    script.async = true;
    script.onload = done;
    script.onerror = () => reject(new Error("pannellum failed"));
    document.body.appendChild(script);
  });
}

/** Same choice as the original tour: medium pano when the GPU can take 4096px. */
function textureSuffix() {
  let max = 0;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) max = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
  } catch {
    max = 0;
  }
  return max >= 4096 ? "_m" : "_s";
}

function tip(hotSpotDiv, text) {
  hotSpotDiv.classList.add("ring");
  const ring = document.createElement("div");
  ring.className = "rg";
  hotSpotDiv.appendChild(ring);
  const label = document.createElement("span");
  label.className = "tt";
  label.textContent = text;
  hotSpotDiv.appendChild(label);
}

export default function TourViewer({ tour }) {
  const panoRef = useRef(null);
  const viewerRef = useRef(null);
  const coneRef = useRef(null);
  const [room, setRoom] = useState("");
  const [sceneId, setSceneId] = useState(tour.firstScene || tour.scenes[0]?.id || "");
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroAvailable, setGyroAvailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [measureOn, setMeasureOn] = useState(false);
  const [dimsOn, setDimsOn] = useState(true);
  const hasRooms = Array.isArray(tour.measure?.rooms) && tour.measure.rooms.length > 0;

  useEffect(() => {
    setGyroAvailable("DeviceOrientationEvent" in window);
    setMapOpen(window.innerWidth > 900);
  }, []);

  useEffect(() => {
    const el = panoRef.current;
    if (!el) return undefined;
    let cancelled = false;
    setReady(false);
    setFailed(false);
    const base = tour.assetBase;
    const suffix = textureSuffix();
    const pitch = Number.isFinite(tour.pitch) ? tour.pitch : -10;
    const byId = Object.fromEntries(tour.scenes.map((scene) => [scene.id, scene]));
    const scenes = {};

    for (const scene of tour.scenes) {
      scenes[scene.id] = {
        title: scene.title,
        type: "equirectangular",
        panorama: `${base}/pano/${scene.id}${suffix}.jpg`,
        preview: `${base}/pano/${scene.id}_s.jpg`,
        pitch,
        hotSpots: (scene.hotspots || []).map((hotspot) => ({
          pitch: hotspot.pitch,
          yaw: hotspot.yaw,
          type: "scene",
          sceneId: hotspot.scene,
          cssClass: "ring",
          createTooltipFunc: tip,
          createTooltipArgs: byId[hotspot.scene]?.title || hotspot.scene,
          targetYaw: "sameAzimuth",
          targetPitch: pitch,
        })),
      };
    }

    // Defer past React strict-mode's setup/cleanup so the viewer is created once.
    // Otherwise a fast second visit paints, gets destroyed, and flashes the loader.
    const timer = setTimeout(() => {
    ensurePannellum()
      .then((pannellum) => {
        if (cancelled) return;
        const viewer = pannellum.viewer(el, {
          default: {
            firstScene: tour.firstScene || tour.scenes[0].id,
            autoLoad: true,
            sceneFadeDuration: 800,
            hfov: Number.isFinite(tour.hfov) ? tour.hfov : 105,
            pitch,
            showFullscreenCtrl: false,
            showControls: false,
            hotSpotDebug: false,
          },
          scenes,
        });
        viewerRef.current = viewer;
        el.__viewer = viewer;
        const mark = () => {
          const id = viewer.getScene();
          setSceneId(id);
          setRoom(byId[id]?.title || "");
          setReady(true);
        };
        viewer.on("scenechange", mark);
        viewer.on("load", mark);
        viewer.on("error", () => {
          if (!cancelled) setFailed(true);
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      if (el) el.__viewer = null;
    };
  }, [tour]);

  // Optional view cone on the minimap: scenes whose map entry carries a `heading`
  // (map bearing of pano yaw 0, degrees clockwise from plan-up) get a wedge that
  // follows the current yaw / field of view. Tours without headings are unaffected.
  const activeScene = tour.scenes.find((scene) => scene.id === sceneId);
  const coneHeading = Number.isFinite(activeScene?.map?.heading) ? activeScene.map.heading : null;
  useEffect(() => {
    if (!mapOpen || !ready || coneHeading === null) return undefined;
    let frame = 0;
    const tick = () => {
      const viewer = viewerRef.current;
      const cone = coneRef.current;
      if (viewer && cone) {
        const yaw = viewer.getYaw();
        const hfov = viewer.getHfov();
        cone.style.transform = `rotate(${coneHeading + yaw}deg)`;
        cone.style.setProperty("--fov", `${Math.max(20, Math.min(160, hfov))}deg`);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mapOpen, ready, coneHeading, sceneId]);

  function loadScene(id) {
    viewerRef.current?.loadScene(id);
  }

  function toggleGyro() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (viewer.isOrientationActive()) {
      viewer.stopOrientation();
      setGyroOn(false);
      return;
    }
    const start = () => {
      viewer.startOrientation();
      setGyroOn(true);
    };
    const orientation = window.DeviceOrientationEvent;
    if (orientation && typeof orientation.requestPermission === "function") {
      orientation.requestPermission().then((result) => {
        if (result === "granted") start();
      });
    } else {
      start();
    }
  }

  const heading = [tour.title, tour.location].filter(Boolean).join(" · ");
  const planSrc = tour.plan ? `${tour.assetBase}/${tour.plan}` : null;
  const noteLines = (tour.note || "").split("\n").filter(Boolean);

  return (
    <div
      className={`visio-tour${measureOn ? " is-measuring" : ""}`}
      dir="rtl"
      data-scene={sceneId}
      data-tour={tour.slug}
    >
      <link rel="stylesheet" href="/vendor/pannellum/pannellum.css" />
      <div id="pano" ref={panoRef} className="visio-tour-pano" dir="ltr" />

      {!ready && (
        <div className={`visio-tour-loading${failed ? " is-error" : ""}`}>
          {failed ? "שגיאה בטעינת הסיור" : "טוען סיור וירטואלי…"}
        </div>
      )}

      <header className="visio-tour-header">
        <div>
          <a className="visio-tour-brand" href="/">VISIO</a>
          <h1 className="visio-tour-title">{heading}</h1>
          <div className="visio-tour-room">{room}</div>
        </div>
        <div className="visio-tour-ctl" dir="ltr">
          <button
            type="button"
            title="מידע"
            aria-label="מידע"
            aria-pressed={noteOpen}
            className={noteOpen ? "on" : undefined}
            onClick={() => setNoteOpen((open) => !open)}
          >
            i
          </button>
          {hasRooms && (
            <button
              type="button"
              title="מידות אוטומטיות"
              aria-label="מידות אוטומטיות"
              aria-pressed={dimsOn}
              data-testid="auto-dims-toggle"
              className={dimsOn ? "on" : undefined}
              onClick={() => setDimsOn((open) => !open)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 17h16M4 15v4M20 15v4M8 17V7M16 17V7" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </button>
          )}
          {tour.measure && (
            <button
              type="button"
              title="מדידה ידנית"
              aria-label="מדידה ידנית"
              aria-pressed={measureOn}
              data-testid="measure-toggle"
              className={measureOn ? "on" : undefined}
              onClick={() => setMeasureOn((open) => !open)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2.5" y="7" width="19" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M7 7v4M11 7v3M15 7v4M19 7v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
          )}
          {gyroAvailable && (
            <button
              type="button"
              title="חיישן תנועה"
              aria-label="חיישן תנועה"
              aria-pressed={gyroOn}
              className={gyroOn ? "on" : undefined}
              onClick={toggleGyro}
            >
              📱
            </button>
          )}
          <button
            type="button"
            title="מסך מלא"
            aria-label="מסך מלא"
            onClick={() => viewerRef.current?.toggleFullscreen()}
          >
            ⛶
          </button>
        </div>
      </header>

      {hasRooms && (
        <AutoDimensions
          model={tour.measure}
          sceneId={sceneId}
          sceneTitle={room}
          viewerRef={viewerRef}
          panoRef={panoRef}
          ready={ready}
          visible={dimsOn && !measureOn}
        />
      )}

      {tour.measure && (
        <MeasureLayer
          active={measureOn}
          model={tour.measure}
          viewerRef={viewerRef}
          panoRef={panoRef}
          sceneId={sceneId}
          ready={ready}
          onClose={() => setMeasureOn(false)}
        />
      )}

      {noteLines.length > 0 && (
        <div id="note" className={`visio-tour-note${noteOpen ? " show" : ""}`}>
          {noteLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

      {planSrc && (
        <div id="map" className={`visio-tour-map${mapOpen ? " open" : ""}`}>
          <div className="visio-tour-map-in" dir="ltr">
            <img src={planSrc} alt="תוכנית הדירה" />
            {coneHeading !== null && activeScene && (
              <div
                ref={coneRef}
                className="visio-tour-cone"
                aria-hidden="true"
                style={{ left: `${activeScene.map.x}%`, top: `${activeScene.map.y}%` }}
              />
            )}
            {tour.scenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                className={`visio-tour-dot${scene.id === sceneId ? " on" : ""}`}
                title={scene.title}
                aria-label={scene.title}
                style={{ left: `${scene.map.x}%`, top: `${scene.map.y}%` }}
                onClick={() => loadScene(scene.id)}
              />
            ))}
            {dimsOn && hasRooms && tour.measure.rooms
              .filter((item) => item.map && item.sceneIds?.includes(sceneId))
              .map((item) => (
                <div
                  key={item.id}
                  className="visio-tour-map-dim"
                  style={{ left: `${item.map.x}%`, top: `${item.map.y}%` }}
                  dir="ltr"
                >
                  {`${item.width.toFixed(1)}×${item.length.toFixed(1)}`}
                </div>
              ))}
          </div>
        </div>
      )}

      <footer className="visio-tour-footer">
        <nav id="rooms" className={`visio-tour-rooms${roomsOpen ? " open" : ""}`} aria-label="חדרים">
          {tour.scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={scene.id === sceneId ? "on" : undefined}
              onClick={() => loadScene(scene.id)}
            >
              <img loading="lazy" src={`${tour.assetBase}/pano/${scene.id}_s.jpg`} alt="" />
              <span>{scene.title}</span>
            </button>
          ))}
        </nav>
        <div className="visio-tour-fbar">
          <button
            type="button"
            className={roomsOpen ? "on" : undefined}
            aria-pressed={roomsOpen}
            onClick={() => setRoomsOpen((open) => !open)}
          >
            ☰ חדרים
          </button>
          <span className="visio-tour-credit">{tour.credit || "VISIO"}</span>
          {planSrc && (
            <button
              type="button"
              className={mapOpen ? "on" : undefined}
              aria-pressed={mapOpen}
              onClick={() => setMapOpen((open) => !open)}
            >
              ⌖ מפה
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
