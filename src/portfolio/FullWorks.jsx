"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PORTFOLIO, PORTFOLIO_FILTERS, cardTagLine, companyOf, groupByCity } from "../data/portfolio.js";
import { mediaFor } from "../data/property-images.js";

function keyStep(key) {
  if (key === "ArrowLeft") return 1;
  if (key === "ArrowRight") return -1;
  return 0;
}
function swipeStep(dx, dy) {
  if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx > 0 ? 1 : -1;
}

const LATIN_RUN = /\d*[A-Za-z][A-Za-z0-9]*(?:[ ./&'+:-]+[A-Za-z0-9]+)*/g;

function Bidi({ children: text }) {
  const parts = [];
  let last = 0;
  for (const m of String(text).matchAll(LATIN_RUN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<bdi key={m.index} lang="en" dir="ltr">{m[0]}</bdi>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Lightbox({ imgs, idx, onStep, onClose }) {
  const touch = useRef(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      const d = imgs.length > 1 ? keyStep(e.key) : 0;
      if (d) { e.preventDefault(); onStep(d); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [imgs.length, onStep, onClose]);
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s || imgs.length < 2) return;
    const t = e.changedTouches[0];
    const d = swipeStep(t.clientX - s.x, t.clientY - s.y);
    if (d) onStep(d);
  };
  return (
    <div className="visio-lightbox" role="dialog" aria-modal="true" aria-label="גלריה" onClick={onClose} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <img src={imgs[idx]} alt="" onClick={e => e.stopPropagation()} draggable={false} />
      <div className="visio-lightbox-controls" onClick={e => e.stopPropagation()}>
        {imgs.length > 1 && (
          <>
            <button type="button" className="visio-icon-btn" onClick={() => onStep(-1)} aria-label="הקודם">‹</button>
            <span className="visio-credit" dir="ltr">{idx + 1} / {imgs.length}</span>
            <button type="button" className="visio-icon-btn" onClick={() => onStep(1)} aria-label="הבא">›</button>
          </>
        )}
        <button type="button" className="visio-icon-btn" onClick={onClose}>✕ סגור</button>
      </div>
    </div>
  );
}

export default function FullWorks() {
  const [company, setCompany] = useState("all");
  const [active, setActive] = useState(null);
  const [lightboxImgs, setLightboxImgs] = useState([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const shown = company === "all" ? PORTFOLIO : PORTFOLIO.filter(p => companyOf(p) === company);
  const nImgs = lightboxImgs.length;
  const stepGallery = useCallback((d) => setLightboxIdx(i => (i + d + nImgs) % nImgs), [nImgs]);
  const closeGallery = useCallback(() => setLightboxImgs([]), []);
  const openGallery = (gallery) => { setLightboxImgs(gallery); setLightboxIdx(0); };

  const renderCard = (p) => {
    const { hero, gallery } = mediaFor(p);
    const tourHref = p.tour
      ? `/tours/${p.tour}`
      : (p.matterport ? `https://my.matterport.com/show/?m=${p.matterport}` : null);
    return (
      <article key={p.id} className="visio-portfolio-card"
        onMouseEnter={() => setActive(p.id)} onMouseLeave={() => setActive(null)}>
        <div className={`visio-portfolio-img-wrap${p.fit === "contain" ? " contain" : ""}`}
          onClick={() => { if (gallery.length) openGallery(gallery); }}>
          {hero ? (
            <img src={hero} alt={p.title} loading="lazy" decoding="async" width={640} height={480} />
          ) : <div className="visio-placeholder"><Bidi>VISIO</Bidi></div>}
          {gallery.length > 1 && <div className="visio-img-label left">⊞ {gallery.length}</div>}
          {active === p.id && (tourHref || gallery.length > 0) && (
            <div className="visio-portfolio-hover" onClick={e => e.stopPropagation()}>
              {tourHref && (
                <a className="visio-btn on-image" href={tourHref} style={{ textDecoration: "none" }}
                  {...(p.tour ? {} : { target: "_blank", rel: "noopener noreferrer", "aria-label": "סיור וירטואלי 3D, אתר חיצוני" })}>
                  {p.tour ? "▶ סיור וירטואלי 3D" : "▶ סיור וירטואלי 3D · אתר חיצוני"}
                </a>
              )}
              {gallery.length > 0 && (
                <button type="button" className="visio-btn on-image outline" onClick={() => openGallery(gallery)}>
                  ⊞ גלריית תמונות ({gallery.length})
                </button>
              )}
            </div>
          )}
        </div>
        {(tourHref || gallery.length > 0) && (
          <div className="visio-mobile-actions">
            {tourHref && (
              <a className="visio-btn" href={tourHref} style={{ textDecoration: "none" }}
                {...(p.tour ? {} : { target: "_blank", rel: "noopener noreferrer", "aria-label": "סיור וירטואלי, אתר חיצוני" })}>
                {p.tour ? "סיור וירטואלי" : "סיור וירטואלי · אתר חיצוני"}
              </a>
            )}
            {gallery.length > 0 && (
              <button type="button" className="visio-btn outline" onClick={() => openGallery(gallery)}>
                גלריה ({gallery.length})
              </button>
            )}
          </div>
        )}
        <div className="visio-portfolio-meta">
          {p.tag && <div className="visio-kicker">{p.tag}</div>}
          <h2 className="visio-story-title">{p.title}</h2>
          <p className="visio-story-dek">{p.sub}</p>
          <div className="visio-credit"><Bidi>{cardTagLine(p)}</Bidi></div>
        </div>
      </article>
    );
  };

  return (
    <section className="visio-section visio-works-page" aria-label="כל העבודות">
      <div className="visio-section-head">
        <div className="visio-kicker"><Bidi>PORTFOLIO</Bidi></div>
        <h1 className="visio-section-title">כל העבודות</h1>
        <p className="visio-section-sub"><Bidi>{`${PORTFOLIO.length} נכסים · אשדוד · אשקלון · יבנה`}</Bidi></p>
      </div>
      <div className="visio-filter-wrap">
        <div className="visio-filter" role="tablist" aria-label="סינון עבודות לפי חברה">
          {PORTFOLIO_FILTERS.map(f => (
            <button key={f.id} type="button" role="tab" aria-selected={company === f.id}
              className={`visio-filter-btn${company === f.id ? " active" : ""}`}
              onClick={() => setCompany(f.id)}>
              <Bidi>{f.label}</Bidi>
            </button>
          ))}
        </div>
      </div>
      {lightboxImgs.length > 0 && (
        <Lightbox imgs={lightboxImgs} idx={lightboxIdx} onStep={stepGallery} onClose={closeGallery} />
      )}
      {company === "rehouse" ? (
        <div className="visio-region-list">
          {groupByCity(shown).map(({ city, items }) => (
            <section key={city} className="visio-region" aria-label={city}>
              <div className="visio-rule-head visio-region-head">
                <span className="visio-kicker">{city}</span>
                <span className="visio-region-count" dir="ltr">{items.length}</span>
              </div>
              <div className="visio-portfolio-grid">
                {items.map(renderCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="visio-portfolio-grid">
          {shown.map(renderCard)}
        </div>
      )}
    </section>
  );
}
