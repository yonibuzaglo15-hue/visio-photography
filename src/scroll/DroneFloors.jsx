"use client";

import { useEffect, useRef, useState } from "react";

const FRAME_COUNT = 120;

/** After the shutter, each glass floor reveals one package, bottom to top. */
const FLOORS = [
  { tier: "essential", from: 0.18 },
  { tier: "motion", from: 0.38 },
  { tier: "signature", from: 0.58 },
  { tier: "social", from: 0.78 },
];

const LATIN_OR_NUM_RUN = /₪?\d*[A-Za-z][A-Za-z0-9]*(?:[ ./&'+:-]+[A-Za-z0-9]+)*|₪?\d+(?:\+\d+)?/g;

function Nums({ text }) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(LATIN_OR_NUM_RUN)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<bdi key={match.index} lang="en" dir="ltr">{match[0]}</bdi>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function floorIndex(progress) {
  let idx = -1;
  for (let i = 0; i < FLOORS.length; i += 1) {
    if (progress >= FLOORS[i].from) idx = i;
  }
  return idx;
}

function frameUrl(mobile, index) {
  const n = String(index + 1).padStart(3, "0");
  return `/drone/${mobile ? "m" : "d"}/${n}.webp`;
}

function placeFrame(img, width, height, pan, scale) {
  const imageRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = width / height;
  let dw;
  let dh;
  if (imageRatio > canvasRatio) {
    dh = height;
    dw = height * imageRatio;
  } else {
    dw = width;
    dh = width / imageRatio;
  }
  dw *= scale;
  dh *= scale;
  return {
    dx: width / 2 - dw / 2 + pan,
    dy: height / 2 - dh / 2,
    dw,
    dh,
  };
}

function mapQuad(quad, place) {
  return quad.map(([nx, ny]) => [place.dx + nx * place.dw, place.dy + ny * place.dh]);
}

function insetQuad(quad, amount) {
  const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4;
  const cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
  const keep = 1 - amount;
  return quad.map(([x, y]) => [cx + (x - cx) * keep, cy + (y - cy) * keep]);
}

function pointInQuad(px, py, quad) {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i, i += 1) {
    const xi = quad[i][0];
    const yi = quad[i][1];
    const xj = quad[j][0];
    const yj = quad[j][1];
    const crosses = (yi > py) !== (yj > py);
    if (crosses && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-6) + xi) inside = !inside;
  }
  return inside;
}

/** Affine-map one triangle of the photo into one triangle of the window. */
function drawTriangle(ctx, img, s0, s1, s2, d0, d1, d2) {
  const x0 = s0[0];
  const y0 = s0[1];
  const x1 = s1[0];
  const y1 = s1[1];
  const x2 = s2[0];
  const y2 = s2[1];
  const u0 = d0[0];
  const v0 = d0[1];
  const u1 = d1[0];
  const v1 = d1[1];
  const u2 = d2[0];
  const v2 = d2[1];
  const denom = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(denom) < 1e-4) return;
  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / denom;
  const b = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / denom;
  const c = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / denom;
  const d = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / denom;
  const e = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / denom;
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / denom;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(u0, v0);
  ctx.lineTo(u1, v1);
  ctx.lineTo(u2, v2);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, d, b, e, c, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawPane(ctx, img, quad) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const s0 = [0, 0];
  const s1 = [w, 0];
  const s2 = [w, h];
  const s3 = [0, h];
  drawTriangle(ctx, img, s0, s1, s2, quad[0], quad[1], quad[2]);
  drawTriangle(ctx, img, s0, s2, s3, quad[0], quad[2], quad[3]);
}

function traceQuads(ctx, quads) {
  ctx.beginPath();
  for (let i = 0; i < quads.length; i += 1) {
    const quad = quads[i];
    ctx.moveTo(quad[0][0], quad[0][1]);
    ctx.lineTo(quad[1][0], quad[1][1]);
    ctx.lineTo(quad[2][0], quad[2][1]);
    ctx.lineTo(quad[3][0], quad[3][1]);
    ctx.closePath();
  }
}

function openPane(pane) {
  if (pane.href) {
    if (pane.href.startsWith("http")) window.open(pane.href, "_blank", "noopener");
    else window.location.assign(pane.href);
    return;
  }
  window.dispatchEvent(new CustomEvent("visio-open-work", { detail: { id: pane.prop } }));
}

export default function DroneFloors({ packages, onNav, showVat, formatPrice }) {
  const actRef = useRef(null);
  const canvasRef = useRef(null);
  const framesRef = useRef([]);
  const panesRef = useRef([]);
  const photosRef = useRef(new Map());
  const hitRef = useRef([]);
  const hoverRef = useRef(-1);
  const [floor, setFloor] = useState(-1);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const act = actRef.current;
    const canvas = canvasRef.current;
    if (!act || !canvas) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(reduce);
    const ctx = canvas.getContext("2d", { alpha: false });
    const mobileQuery = window.matchMedia("(max-width: 768px)");
    let mobile = mobileQuery.matches;
    let frames = framesRef.current;
    let loaded = false;
    let raf = 0;
    let shown = reduce ? 0.42 : 0;
    let target = shown;
    let lastFloor = -1;
    let alive = true;

    const resize = () => {
      const stage = canvas.parentElement;
      if (!stage) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, stage.clientWidth);
      const h = Math.max(1, stage.clientHeight);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const paint = () => {
      if (!alive) return;
      const idx = Math.round(shown * (FRAME_COUNT - 1));
      let img = frames[idx];
      if (!img) {
        for (let d = 1; d < FRAME_COUNT; d += 1) {
          if (frames[idx - d]) { img = frames[idx - d]; break; }
          if (frames[idx + d]) { img = frames[idx + d]; break; }
        }
      }
      if (!img) return;
      const emerge = clamp01((shown - 0.14) / 0.72);
      const pan = emerge * canvas.width * (mobile ? 0.02 : 0.04);
      const scale = 1 + emerge * (mobile ? 0.05 : 0.09);
      const place = placeFrame(img, canvas.width, canvas.height, pan, scale);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0c0e10";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, place.dx, place.dy, place.dw, place.dh);

      const framePanes = panesRef.current[idx] || [];
      const glass = [];
      const hits = [];
      for (let i = 0; i < framePanes.length; i += 1) {
        const pane = framePanes[i];
        const photo = photosRef.current.get(pane.src);
        const quad = insetQuad(mapQuad(pane.quad, place), 0.07);
        hits.push({ pane, quad: mapQuad(pane.quad, place) });
        if (!photo) continue;
        glass.push({ photo, quad, hot: hoverRef.current === i });
      }
      hitRef.current = hits;

      if (glass.length) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.globalCompositeOperation = "multiply";
        ctx.filter = "blur(0.35px)";
        for (let i = 0; i < glass.length; i += 1) drawPane(ctx, glass[i].photo, glass[i].quad);
        ctx.filter = "none";
        ctx.restore();

        ctx.save();
        traceQuads(ctx, glass.map((item) => item.quad));
        ctx.clip();
        ctx.globalAlpha = 0.28;
        ctx.globalCompositeOperation = "screen";
        ctx.drawImage(img, place.dx, place.dy, place.dw, place.dh);
        ctx.restore();

        const hover = glass.find((item) => item.hot);
        if (hover) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = Math.max(2, canvas.width / 700);
          ctx.beginPath();
          ctx.moveTo(hover.quad[0][0], hover.quad[0][1]);
          ctx.lineTo(hover.quad[1][0], hover.quad[1][1]);
          ctx.lineTo(hover.quad[2][0], hover.quad[2][1]);
          ctx.lineTo(hover.quad[3][0], hover.quad[3][1]);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }
      }
      canvas.classList.add("is-ready");
      const next = floorIndex(shown);
      if (next !== lastFloor) {
        lastFloor = next;
        setFloor(next);
      }
    };

    const tick = () => {
      shown += (target - shown) * 0.18;
      if (Math.abs(target - shown) < 0.004) shown = target;
      paint();
      const rect = act.getBoundingClientRect();
      const near = rect.bottom > -40 && rect.top < window.innerHeight + 40;
      if (alive && !reduce && (near || Math.abs(target - shown) > 0.004)) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    const progress = () => {
      if (reduce) return;
      const travel = Math.max(act.offsetHeight - window.innerHeight, 1);
      target = clamp01(-act.getBoundingClientRect().top / travel);
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const loadPhotos = (list) => {
      const srcs = [];
      for (let i = 0; i < list.length; i += 1) {
        const frame = list[i] || [];
        for (let j = 0; j < frame.length; j += 1) {
          if (!srcs.includes(frame[j].src)) srcs.push(frame[j].src);
        }
      }
      let cursor = 0;
      const pump = () => {
        if (!alive) return;
        const batch = [];
        while (batch.length < 6 && cursor < srcs.length) {
          const src = srcs[cursor];
          cursor += 1;
          batch.push(new Promise((resolve) => {
            const image = new Image();
            image.decoding = "async";
            image.src = src;
            image.onload = () => { photosRef.current.set(src, image); resolve(); };
            image.onerror = () => resolve();
          }));
        }
        if (!batch.length) return;
        Promise.all(batch).then(() => {
          if (!raf) raf = requestAnimationFrame(tick);
          pump();
        });
      };
      pump();
    };

    const loadFrames = () => {
      if (loaded) return;
      loaded = true;
      frames = new Array(FRAME_COUNT);
      framesRef.current = frames;
      fetch("/drone/panes.json")
        .then((res) => res.json())
        .then((data) => {
          if (!alive) return;
          panesRef.current = data.frames || [];
          loadPhotos(panesRef.current);
          if (!raf) raf = requestAnimationFrame(tick);
        })
        .catch(() => {});
      const queue = [];
      for (let step = 8; step >= 1; step = Math.floor(step / 2)) {
        for (let i = 0; i < FRAME_COUNT; i += step) {
          if (!queue.includes(i)) queue.push(i);
        }
      }
      let cursor = 0;
      const pump = () => {
        if (!alive) return;
        const batch = [];
        while (batch.length < 4 && cursor < queue.length) {
          const index = queue[cursor];
          cursor += 1;
          batch.push(new Promise((resolve) => {
            const image = new Image();
            image.decoding = "async";
            image.src = frameUrl(mobile, index);
            image.onload = () => { frames[index] = image; resolve(); };
            image.onerror = () => resolve();
          }));
        }
        if (!batch.length) return;
        Promise.all(batch).then(() => {
          if (!raf) raf = requestAnimationFrame(tick);
          pump();
        });
      };
      pump();
    };

    const pointOf = (event) => {
      const rect = canvas.getBoundingClientRect();
      return [
        (event.clientX - rect.left) * (canvas.width / rect.width),
        (event.clientY - rect.top) * (canvas.height / rect.height),
      ];
    };

    const hitTest = (event) => {
      const [x, y] = pointOf(event);
      const hits = hitRef.current;
      for (let i = hits.length - 1; i >= 0; i -= 1) {
        if (pointInQuad(x, y, hits[i].quad)) return i;
      }
      return -1;
    };

    const onMove = (event) => {
      const next = hitTest(event);
      canvas.style.cursor = next >= 0 ? "pointer" : "";
      if (next !== hoverRef.current) {
        hoverRef.current = next;
        if (!raf) raf = requestAnimationFrame(tick);
      }
    };

    const onLeave = () => {
      canvas.style.cursor = "";
      if (hoverRef.current !== -1) {
        hoverRef.current = -1;
        if (!raf) raf = requestAnimationFrame(tick);
      }
    };

    const onClick = (event) => {
      const next = hitTest(event);
      if (next < 0) return;
      const hit = hitRef.current[next];
      if (hit) openPane(hit.pane);
    };

    resize();
    const onResize = () => {
      const nextMobile = mobileQuery.matches;
      if (nextMobile !== mobile) {
        mobile = nextMobile;
        loaded = false;
        frames = [];
        framesRef.current = frames;
        loadFrames();
      }
      resize();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadFrames();
    }, { rootMargin: "70% 0px" });
    io.observe(act);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    if (!reduce) window.addEventListener("scroll", progress, { passive: true });
    window.addEventListener("resize", onResize);
    if (reduce) loadFrames();
    else progress();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("scroll", progress);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const pkg = floor >= 0 ? packages[floor] : null;
  const cards = reduced ? packages : (pkg ? [pkg] : []);

  return (
    <section id="pricing" className={`visio-drone-act${reduced ? " is-reduced" : ""}`} ref={actRef} aria-label="חבילות ומחירים">
      <div className="visio-drone-live">
        <div className="visio-drone-stage">
          <img className="visio-drone-poster" src="/drone/poster.webp" alt="" />
          <canvas ref={canvasRef} className="visio-drone-canvas" aria-label="חלונות הבניין עם עבודות שצילמנו" />
          <DroneHeading />
          <div className="visio-drone-card-slot">
            {cards.map((item) => (
              <article key={item.id} className={`visio-drone-card metal-${item.tier}`} dir="rtl">
                <img className="visio-drone-emblem" src={`/packages/visio-${item.tier}.svg`} alt={item.name} width="72" height="72" />
                <div className="visio-drone-name" dir="ltr">{item.name}</div>
                <div className="visio-drone-price" dir="ltr" style={{ unicodeBidi: "isolate" }}>₪{formatPrice(item.price)}</div>
                <div className="visio-drone-meta">
                  {item.unit ? `${item.unit} · ` : ""}{showVat ? "כולל מע״מ" : "+ מע״מ"}
                </div>
                <p className="visio-drone-desc"><Nums text={item.desc} /></p>
                {item.note && <p className="visio-drone-note"><Nums text={`* ${item.note}`} /></p>}
                <button type="button" className="visio-btn visio-drone-cta" onClick={() => onNav("booking")}>
                  הזמן עכשיו ← תשלום ביום הצילום
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DroneHeading() {
  return (
    <div className="visio-drone-head">
      <div className="visio-kicker">PRICING</div>
      <h2 className="visio-section-title">חבילות ומחירים</h2>
      <p className="visio-section-sub">מחירים שקופים · ללא הפתעות</p>
    </div>
  );
}
