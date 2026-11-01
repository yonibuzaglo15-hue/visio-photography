"use client";

import { useEffect, useRef } from "react";

const FRAME_COUNT = 90;
/** The lighting finishes before the pin ends, so the lit lobby holds. */
const LIGHT_END = 0.82;

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function frameUrl(mobile, index) {
  const n = String(index + 1).padStart(3, "0");
  return `/lamps/${mobile ? "m" : "d"}/${n}.webp`;
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

export default function LampLobby() {
  const actRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const act = actRef.current;
    const canvas = canvasRef.current;
    if (!act || !canvas) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) act.classList.add("is-reduced");
    const ctx = canvas.getContext("2d", { alpha: false });
    const mobileQuery = window.matchMedia("(max-width: 768px)");
    let mobile = mobileQuery.matches;
    let frames = new Array(FRAME_COUNT);
    let loaded = false;
    let raf = 0;
    let shown = reduce ? 1 : 0;
    let target = shown;
    let alive = true;

    const resize = () => {
      const stage = canvas.parentElement;
      if (!stage) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(Math.max(1, stage.clientWidth) * dpr);
      canvas.height = Math.round(Math.max(1, stage.clientHeight) * dpr);
    };

    const paint = () => {
      if (!alive) return;
      const lit = reduce ? 1 : clamp01(shown / LIGHT_END);
      act.style.setProperty("--sc-p", String(reduce ? 1 : shown));
      const idx = Math.min(FRAME_COUNT - 1, Math.round(lit * (FRAME_COUNT - 1)));
      let img = frames[idx];
      if (!img) {
        for (let d = 1; d < FRAME_COUNT; d += 1) {
          if (frames[idx - d]) { img = frames[idx - d]; break; }
          if (frames[idx + d]) { img = frames[idx + d]; break; }
        }
      }
      if (!img) return;
      drawCover(ctx, img, canvas.width, canvas.height);
      canvas.classList.add("is-ready");
    };

    const tick = () => {
      shown += (target - shown) * 0.2;
      if (Math.abs(target - shown) < 0.003) shown = target;
      paint();
      const rect = act.getBoundingClientRect();
      const near = rect.bottom > -40 && rect.top < window.innerHeight + 40;
      if (alive && !reduce && (near || Math.abs(target - shown) > 0.003)) {
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

    const loadFrames = () => {
      if (loaded) return;
      loaded = true;
      const order = [];
      if (reduce) {
        order.push(FRAME_COUNT - 1);
      } else {
        for (let step = 8; step >= 1; step = Math.floor(step / 2)) {
          for (let i = 0; i < FRAME_COUNT; i += step) {
            if (!order.includes(i)) order.push(i);
          }
        }
      }
      let cursor = 0;
      const pump = () => {
        if (!alive) return;
        const batch = [];
        while (batch.length < 4 && cursor < order.length) {
          const index = order[cursor];
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

    resize();
    const onResize = () => {
      const nextMobile = mobileQuery.matches;
      if (nextMobile !== mobile) {
        mobile = nextMobile;
        loaded = false;
        frames = new Array(FRAME_COUNT);
        loadFrames();
      }
      resize();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadFrames();
    }, { rootMargin: "60% 0px" });
    io.observe(act);
    if (!reduce) window.addEventListener("scroll", progress, { passive: true });
    window.addEventListener("resize", onResize);
    if (reduce) loadFrames();
    else progress();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", progress);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section className="visio-quote-act" ref={actRef} aria-label="נדל״ן. בצילום שמוכר.">
      <div className="visio-lamp-live">
        <div className="visio-quote-stage">
          <img className="visio-lamp-poster" src="/lamps/d/001.webp" alt="" />
          <canvas ref={canvasRef} className="visio-lamp-canvas" aria-hidden="true" />
          <div className="visio-scene-scrim" aria-hidden="true" />
          <div className="visio-quote-copy">
            <blockquote className="visio-pullquote visio-assemble">
              <span><span>נדל״ן.</span></span>
              <span><span>בצילום שמוכר.</span></span>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}
