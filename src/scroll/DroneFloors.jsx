"use client";

import { useEffect, useRef, useState } from "react";

const FRAME_COUNT = 120;
const WINDOW_COLS = 6;
const WINDOW_ROWS = 4;
const WINDOW_TILES = Array.from({ length: WINDOW_COLS * WINDOW_ROWS }, (_, i) => {
  const n = String((i % 12) + 1).padStart(2, "0");
  return `/drone/windows/${n}.webp`;
});

/** After the shutter, each glass floor reveals one package, bottom to top. */
const FLOORS = [
  { tier: "essential", from: 0.18 },
  { tier: "motion", from: 0.38 },
  { tier: "signature", from: 0.58 },
  { tier: "social", from: 0.78 },
];

/**
 * Glass rectangle as percentages of the frame. Tuned to the curtain wall
 * as the drone climbs: wide and low at first, then larger and higher.
 */
const GLASS = [
  { p: 0.12, x: 24, y: 20, w: 52, h: 46, o: 0 },
  { p: 0.22, x: 22, y: 17, w: 56, h: 50, o: 0.88 },
  { p: 0.4, x: 15, y: 13, w: 70, h: 58, o: 0.9 },
  { p: 0.62, x: 1, y: 28, w: 98, h: 66, o: 0.86 },
  { p: 0.86, x: 2, y: 6, w: 96, h: 70, o: 0.82 },
  { p: 1, x: 0, y: 2, w: 100, h: 76, o: 0.78 },
];

const LATIN_OR_NUM_RUN = /₪?\d*[A-Za-z][A-Za-z0-9]*(?:[ ./&'+:-]+[A-Za-z0-9]+)*|₪?\d+(?:\+\d+)?/g;

function Nums({ text }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(LATIN_OR_NUM_RUN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<bdi key={m.index} lang="en" dir="ltr">{m[0]}</bdi>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function glassAt(p) {
  let a = GLASS[0];
  let b = GLASS[GLASS.length - 1];
  for (let i = 0; i < GLASS.length - 1; i += 1) {
    if (p >= GLASS[i].p && p <= GLASS[i + 1].p) {
      a = GLASS[i];
      b = GLASS[i + 1];
      break;
    }
  }
  const span = Math.max(b.p - a.p, 0.0001);
  const t = clamp01((p - a.p) / span);
  const mix = (k) => a[k] + (b[k] - a[k]) * t;
  return { x: mix("x"), y: mix("y"), w: mix("w"), h: mix("h"), o: mix("o") };
}

function floorIndex(p) {
  let idx = -1;
  for (let i = 0; i < FLOORS.length; i += 1) {
    if (p >= FLOORS[i].from) idx = i;
  }
  return idx;
}

function frameUrl(mobile, index) {
  const n = String(index + 1).padStart(3, "0");
  return `/drone/${mobile ? "m" : "d"}/${n}.webp`;
}

function drawCover(ctx, img, w, h) {
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = w / h;
  let dw;
  let dh;
  let dx;
  let dy;
  if (ir > cr) {
    dh = h;
    dw = h * ir;
    dx = (w - dw) / 2;
    dy = 0;
  } else {
    dw = w;
    dh = w / ir;
    dx = 0;
    dy = (h - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

export default function DroneFloors({ packages, onNav, showVat, formatPrice }) {
  const actRef = useRef(null);
  const canvasRef = useRef(null);
  const glassRef = useRef(null);
  const framesRef = useRef([]);
  const [floor, setFloor] = useState(-1);

  useEffect(() => {
    const act = actRef.current;
    const canvas = canvasRef.current;
    const glass = glassRef.current;
    if (!act || !canvas || !glass) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    const ctx = canvas.getContext("2d", { alpha: false });
    const mobileQuery = window.matchMedia("(max-width: 768px)");
    let mobile = mobileQuery.matches;
    let frames = framesRef.current;
    let loaded = false;
    let raf = 0;
    let shown = 0;
    let target = 0;
    let drawn = -1;
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
      drawn = -1;
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
      if (img && img !== drawn) {
        drawCover(ctx, img, canvas.width, canvas.height);
        drawn = img;
        canvas.classList.add("is-ready");
      }
      const g = glassAt(shown);
      glass.style.left = `${g.x}%`;
      glass.style.top = `${g.y}%`;
      glass.style.width = `${g.w}%`;
      glass.style.height = `${g.h}%`;
      glass.style.opacity = String(g.o);
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
      if (alive && (near || Math.abs(target - shown) > 0.004)) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    const progress = () => {
      const travel = Math.max(act.offsetHeight - window.innerHeight, 1);
      target = clamp01(-act.getBoundingClientRect().top / travel);
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const loadFrames = () => {
      if (loaded) return;
      loaded = true;
      frames = new Array(FRAME_COUNT);
      framesRef.current = frames;
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
            const img = new Image();
            img.decoding = "async";
            img.src = frameUrl(mobile, index);
            img.onload = () => { frames[index] = img; resolve(); };
            img.onerror = () => resolve();
          }));
        }
        if (!batch.length) return;
        Promise.all(batch).then(() => {
          drawn = -1;
          if (!raf) raf = requestAnimationFrame(tick);
          pump();
        });
      };
      pump();
    };

    resize();
    const onResize = () => {
      const nextMobile = mobileQuery.matches;
      if (nextMobile !== mobile) {
        mobile = nextMobile;
        loaded = false;
        frames = [];
        framesRef.current = frames;
        drawn = -1;
        loadFrames();
      }
      resize();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadFrames();
    }, { rootMargin: "70% 0px" });
    io.observe(act);
    window.addEventListener("scroll", progress, { passive: true });
    window.addEventListener("resize", onResize);
    progress();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", progress);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const pkg = floor >= 0 ? packages[floor] : null;

  return (
    <section id="pricing" className="visio-drone-act" ref={actRef} aria-label="חבילות ומחירים">
      <div className="visio-drone-still">
        <img src="/drone/poster.webp" alt="" />
        <DroneHeading />
      </div>
      <div className="visio-drone-live">
        <div className="visio-drone-stage">
          <img className="visio-drone-poster" src="/drone/poster.webp" alt="" />
          <canvas ref={canvasRef} className="visio-drone-canvas" />
          <div className="visio-drone-windows" ref={glassRef} aria-hidden="true">
            {WINDOW_TILES.map((src, i) => (
              <img key={src + i} src={src} alt="" />
            ))}
          </div>
          <DroneHeading />
          <div className="visio-drone-card-slot">
            {pkg && (
              <article key={pkg.id} className={`visio-drone-card metal-${pkg.tier}`} dir="rtl">
                <img className="visio-drone-emblem" src={`/packages/visio-${pkg.tier}.svg`} alt={pkg.name} width="72" height="72" />
                <div className="visio-drone-name" dir="ltr">{pkg.name}</div>
                <div className="visio-drone-price" dir="ltr" style={{ unicodeBidi: "isolate" }}>₪{formatPrice(pkg.price)}</div>
                <div className="visio-drone-meta">
                  {pkg.unit ? `${pkg.unit} · ` : ""}{showVat ? "כולל מע״מ" : "+ מע״מ"}
                </div>
                <p className="visio-drone-desc"><Nums text={pkg.desc} /></p>
                {pkg.note && <p className="visio-drone-note"><Nums text={`* ${pkg.note}`} /></p>}
                <button type="button" className="visio-btn visio-drone-cta" onClick={() => onNav("booking")}>
                  הזמן עכשיו ← תשלום ביום הצילום
                </button>
              </article>
            )}
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
