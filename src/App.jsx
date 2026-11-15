"use client";

import { useState, useRef, useLayoutEffect, useEffect, useCallback, memo } from "react";

import { C } from "./theme/colors.js";
import ThemeToggle from "./theme/ThemeToggle.jsx";
import { useScrollCraft } from "./scroll/useScrollCraft.js";
import DroneFloors from "./scroll/DroneFloors.jsx";
import LampLobby from "./scroll/LampLobby.jsx";
import { CUSTOMER_TYPES, OWNER_CONSENT_TEXT } from "../lib/booking-consent.js";
import { PUBLIC_TERMS } from "./legal/terms.js";
const PROPERTY_IMAGES = {
  1: { hero: "/home/1/hero.webp", gallery: ["/home/1/01.webp"] },
  2: { hero: "/home/2/hero.webp", gallery: ["/home/2/01.webp"] },
  5: { hero: "/home/5/hero.webp", gallery: ["/home/5/01.webp", "/home/5/02.webp", "/home/5/03.webp", "/home/5/04.webp", "/home/5/05.webp", "/home/5/06.webp"] },
  7: { hero: "/home/7/hero.webp", gallery: ["/home/7/01.webp", "/home/7/02.webp", "/home/7/03.webp", "/home/7/04.webp", "/home/7/05.webp", "/home/7/06.webp", "/home/7/07.webp", "/home/7/08.webp"] },
  8: { hero: "/home/8/hero.webp", gallery: ["/home/8/01.webp", "/home/8/02.webp", "/home/8/03.webp", "/home/8/04.webp", "/home/8/05.webp", "/home/8/06.webp", "/home/8/07.webp", "/home/8/08.webp"] },
  9: { hero: "/home/9/hero.webp", gallery: ["/home/9/01.webp", "/home/9/02.webp", "/home/9/03.webp", "/home/9/04.webp", "/home/9/05.webp", "/home/9/06.webp", "/home/9/07.webp", "/home/9/08.webp"] },
};


/* ════════════════════════════════════════════════
   VISIO — Real Estate Photography Agency
   Editorial monochrome aesthetic · RTL Hebrew
════════════════════════════════════════════════ */


const fmt = (n) => Math.round(n).toLocaleString("he-IL");
const VAT = 0.18;

/* ─── BIDI ─── */
// Latin runs (incl. leading digits like "4K" and inner separators like "RE/MAX", "9:16")
// are isolated so neighbouring Hebrew punctuation and word order don't flip.
const LATIN_RUN = /\d*[A-Za-z][A-Za-z0-9]*(?:[ ./&'+:-]+[A-Za-z0-9]+)*/g;

// Pricing copy also isolates number runs (12+12, ₪40) so they never reorder neighbouring Hebrew.
const LATIN_OR_NUM_RUN = /₪?\d*[A-Za-z][A-Za-z0-9]*(?:[ ./&'+:-]+[A-Za-z0-9]+)*|₪?\d+(?:\+\d+)?/g;
function Bidi({ children: text, numbers = false }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(numbers ? LATIN_OR_NUM_RUN : LATIN_RUN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<bdi key={m.index} lang="en" dir="ltr">{m[0]}</bdi>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/* ─── SECTION TITLE ─── */
function SectionTitle({ sup, title, sub }) {
  return (
    <div className="visio-section-head">
      <div className="visio-kicker"><Bidi>{sup}</Bidi></div>
      <h2 className="visio-section-title"><Bidi>{title}</Bidi></h2>
      {sub && <p className="visio-section-sub"><Bidi>{sub}</Bidi></p>}
    </div>
  );
}

/* ─── STORY IMAGE ─── */
function StoryImage({ id, title, eager = false }) {
  const src = PROPERTY_IMAGES[id]?.hero;
  return (
    <div className="visio-story-img">
      {src ? <img src={src} alt={title} loading={eager ? "eager" : "lazy"} decoding="async" /> : <div className="visio-placeholder"><Bidi>VISIO</Bidi></div>}
    </div>
  );
}

/* Full figure, including the suffix, lives in one LTR isolate so RTL cannot
   split "500+", "24–48", "100%" or "12+12" across the stat cells. */
function StatFigure({ value, suffix = "", duration = 1200 }) {
  const ref = useRef(null);
  const [text, setText] = useState(`${value}${suffix}`);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let alive = true;
    const paint = (n) => {
      if (alive) setText(`${n}${suffix}`);
    };
    const run = () => {
      if (reduce || duration <= 0) {
        paint(value);
        return;
      }
      const t0 = performance.now();
      const tick = (now) => {
        if (!alive) return;
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - (1 - t) ** 3;
        paint(Math.round(value * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      paint(0);
      raf = requestAnimationFrame(tick);
    };
    if (typeof IntersectionObserver === "undefined") {
      run();
      return () => {
        alive = false;
        cancelAnimationFrame(raf);
      };
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      run();
    }, { threshold: 0.35 });
    io.observe(el);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [value, suffix, duration]);
  return (
    <span ref={ref} className="visio-stat-figure" dir="ltr" style={{ unicodeBidi: "isolate" }}>
      {text}
    </span>
  );
}

/* The hero stage is taller than the first screen, because the masthead sits above it.
   The headline lives at the bottom of that stage, so on the first view only the tops
   of the letters crossed the fold. Lift the copy until it sits fully inside the
   visible part of the stage, and hide it if there is no room to show it whole. */
function useHeroCopyFit(ref) {
  useEffect(() => {
    const act = ref.current;
    if (!act) return undefined;
    const stage = act.querySelector(".visio-hero-stage");
    const copy = act.querySelector(".visio-hero-copy");
    if (!stage || !copy) return undefined;
    let raf = 0;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.height < 40) return;
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
      const room = visibleBottom - visibleTop;
      const needed = copy.offsetHeight + 28;
      if (room < needed) {
        copy.classList.remove("is-fit");
        return;
      }
      const lift = Math.max(0, rect.bottom - window.innerHeight);
      copy.style.bottom = `${Math.round(lift + 16)}px`;
      copy.classList.add("is-fit");
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const observer = new ResizeObserver(onScroll);
    observer.observe(stage);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref]);
}

/* Recent-work strip. The engine's pan always translates toward the left, which
   parks an RTL rail on the wrong edge. This pins the inline-start (right) and
   moves the rail toward the right as the section scrolls, revealing later jobs. */
function useWorkPan(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const rail = root.querySelector("[data-visio-rail]");
    if (!rail) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    const update = () => {
      if (mq.matches) {
        rail.style.transform = "";
        return;
      }
      const sticky = root.querySelector(".visio-work-sticky") || root;
      const travel = Math.max(root.offsetHeight - window.innerHeight, 1);
      const p = Math.min(1, Math.max(0, -root.getBoundingClientRect().top / travel));
      const view = sticky.clientWidth || window.innerWidth;
      const over = Math.max(0, rail.scrollWidth - view);
      rail.style.transform = `translate3d(${(over * p).toFixed(2)}px, 0, 0)`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    mq.addEventListener?.("change", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      mq.removeEventListener?.("change", onScroll);
    };
  }, [ref]);
}

/* Engine splits this node's text. Memo keeps React from wiping the split on parent renders. */
const KineticTitle = memo(function KineticTitle({ as: Tag = "h2", className, cue, children }) {
  return (
    <Tag className={className} data-sc-cue={cue} data-sc-kinetic="lines">
      {children}
    </Tag>
  );
});

/* ─── DATA ─── */
const PORTFOLIO = [
  { id: 1, title: "דקר · אשדוד", sub: "בריכה פרטית · דק עץ", city: "אשדוד", tag: "רחפן + סיור וירטואלי", partner: "ReHouse", matterport: "ooDYEMx6TCr", tags: ["בריכה","דק עץ","סיור וירטואלי"] },
  { id: 2, title: "שבט לוי · אשדוד", sub: "מרפסת פינורמית · נוף ים", city: "אשדוד", partner: "ReHouse", matterport: "g1C8Upb3G6q", tags: ["מרפסת"] },
  { id: 3, title: "נחל שניר · אשדוד", sub: "קיר שיש · פרקט אירופאי", city: "אשדוד", tag: "בוטיק", partner: "ReHouse", company: "rehouse", hero: "/portfolio/nahal-snir-boutique/01.jpg", gallery: ["/portfolio/nahal-snir-boutique/01.jpg", "/portfolio/nahal-snir-boutique/02.jpg", "/portfolio/nahal-snir-boutique/03.jpg", "/portfolio/nahal-snir-boutique/04.jpg", "/portfolio/nahal-snir-boutique/05.jpg", "/portfolio/nahal-snir-boutique/06.jpg", "/portfolio/nahal-snir-boutique/07.jpg", "/portfolio/nahal-snir-boutique/08.jpg", "/portfolio/nahal-snir-boutique/09.jpg", "/portfolio/nahal-snir-boutique/10.jpg"], tags: ["קיר שיש","פרקט","בוטיק"] },
  { id: 4, title: "בלפור · אשדוד", sub: "לובי יוקרה · שיש איטלקי", city: "אשדוד", tag: "לובי יוקרה", partner: "ReHouse", company: "rehouse", matterport: "9YJGFmX8KbJ", hero: "/portfolio/balfour/01.jpg", gallery: ["/portfolio/balfour/01.jpg", "/portfolio/balfour/02.jpg", "/portfolio/balfour/03.jpg", "/portfolio/balfour/04.jpg", "/portfolio/balfour/05.jpg", "/portfolio/balfour/06.jpg", "/portfolio/balfour/07.jpg", "/portfolio/balfour/08.jpg", "/portfolio/balfour/09.jpg", "/portfolio/balfour/10.jpg"], tags: ["לובי יוקרה","שיש"] },
  { id: 5, title: "הפטל · יבנה", sub: "גינה · פרגולה · עצי לימון", city: "יבנה", tag: "דירת גן", partner: "ReHouse", matterport: "AF18oBWVfrm", tags: ["גינה","פרגולה","עצי לימון"] },
  { id: 6, title: "המשוט · אשדוד", sub: "גינה · שיש · סלון מרווח", city: "אשדוד", tag: "דירת גן", partner: "ReHouse", company: "rehouse", hero: "/portfolio/hamashot/01.jpg", gallery: ["/portfolio/hamashot/01.jpg", "/portfolio/hamashot/02.jpg", "/portfolio/hamashot/03.jpg", "/portfolio/hamashot/04.jpg", "/portfolio/hamashot/05.jpg", "/portfolio/hamashot/06.jpg", "/portfolio/hamashot/07.jpg", "/portfolio/hamashot/08.jpg", "/portfolio/hamashot/09.jpg"], tags: ["גינה","שיש","סלון"] },
  { id: 7, title: "אבות ישורון · אשדוד", sub: "דירת גן · 2 גינות · פרגולה · סלון מעוצב", city: "אשדוד", tag: "דירת גן + פרגולה", partner: "ReHouse", tags: ["דירת גן","גינה","פרגולה","סלון מרווח"] },
  { id: 8, title: "קרן היסוד · אשדוד", sub: "פנטהאוז · גג יוקרתי · בר + מטבח חיצוני", city: "אשדוד", tag: "פנטהאוז + גג", partner: "ReHouse", matterport: "so6PszZrxgx", tags: ["פנטהאוז","גג מעוצב","בר","סיור וירטואלי"] },
  { id: 9, title: "הגלים · אשדוד", sub: "וילה פרטית · גינה מטופחת · חדר הורים מפנק", city: "אשדוד", tag: "וילה", partner: "ReHouse", tags: ["וילה","גינה","חדר הורים","מרוהטת"] },
  { id: 10, title: "שבט לוי · אשדוד", sub: "מרפסת · סלון · מטבח · 44 נקודות", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "RE/MAX", company: "remax", matterport: "Hkg7xrnXgoM", tour: "ashdod-apartment", fit: "contain", hero: "/portfolio/shevet-levi/16.jpg", gallery: ["/portfolio/shevet-levi/16.jpg", "/portfolio/shevet-levi/17.jpg", "/portfolio/shevet-levi/18.jpg", "/portfolio/shevet-levi/19.jpg", "/portfolio/shevet-levi/20.jpg", "/portfolio/shevet-levi/21.jpg", "/portfolio/shevet-levi/13.jpg", "/portfolio/shevet-levi/14.jpg", "/portfolio/shevet-levi/15.jpg", "/portfolio/shevet-levi/09.jpg", "/portfolio/shevet-levi/10.jpg", "/portfolio/shevet-levi/11.jpg", "/portfolio/shevet-levi/12.jpg", "/portfolio/shevet-levi/01.jpg", "/portfolio/shevet-levi/02.jpg", "/portfolio/shevet-levi/03.jpg", "/portfolio/shevet-levi/04.jpg", "/portfolio/shevet-levi/05.jpg", "/portfolio/shevet-levi/06.jpg", "/portfolio/shevet-levi/07.jpg", "/portfolio/shevet-levi/08.jpg"], tags: ["מרפסת","סלון","מטבח","סיור וירטואלי"] },
  { id: 11, title: "רוטשילד · אשדוד", sub: "רובע ט״ו", city: "אשדוד", tag: "דירה", partner: "RE/MAX", company: "remax", hero: "/portfolio/rothschild/01.jpg", gallery: ["/portfolio/rothschild/01.jpg", "/portfolio/rothschild/02.jpg", "/portfolio/rothschild/03.jpg", "/portfolio/rothschild/04.jpg", "/portfolio/rothschild/05.jpg", "/portfolio/rothschild/06.jpg", "/portfolio/rothschild/07.jpg", "/portfolio/rothschild/08.jpg", "/portfolio/rothschild/09.jpg"], tags: ["סלון","מרפסת","מטבח"] },
  { id: 12, title: "נחל לכיש · אשדוד", sub: "רובע י״א", city: "אשדוד", tag: "דירה", partner: "RE/MAX", company: "remax", hero: "/portfolio/nahal-lachish/01.jpg", gallery: ["/portfolio/nahal-lachish/01.jpg", "/portfolio/nahal-lachish/02.jpg", "/portfolio/nahal-lachish/03.jpg", "/portfolio/nahal-lachish/04.jpg", "/portfolio/nahal-lachish/05.jpg", "/portfolio/nahal-lachish/06.jpg", "/portfolio/nahal-lachish/07.jpg", "/portfolio/nahal-lachish/08.jpg", "/portfolio/nahal-lachish/09.jpg", "/portfolio/nahal-lachish/10.jpg"], tags: ["סלון","מטבח","פינת אוכל"] },
  { id: 13, title: "יהויכין · אשדוד", sub: "רובע י״ג · סלון · מרפסת · 35 נקודות", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "RE/MAX", company: "remax", tour: "yehoyakin", hero: "/portfolio/yehoyachin/01.jpg", gallery: ["/portfolio/yehoyachin/01.jpg", "/portfolio/yehoyachin/02.jpg", "/portfolio/yehoyachin/03.jpg", "/portfolio/yehoyachin/04.jpg", "/portfolio/yehoyachin/05.jpg", "/portfolio/yehoyachin/06.jpg", "/portfolio/yehoyachin/07.jpg", "/portfolio/yehoyachin/08.jpg", "/portfolio/yehoyachin/09.jpg"], tags: ["סלון","מרפסת","סיור וירטואלי 3D"] },
  { id: 14, title: "ביאליק · אשדוד", sub: "רובע ה׳", city: "אשדוד", tag: "דירה", partner: "RE/MAX", company: "remax", hero: "/portfolio/bialik/01.jpg", gallery: ["/portfolio/bialik/01.jpg", "/portfolio/bialik/02.jpg", "/portfolio/bialik/03.jpg", "/portfolio/bialik/04.jpg", "/portfolio/bialik/05.jpg", "/portfolio/bialik/06.jpg"], tags: ["סלון","מטבח","פינת אוכל"] },
  { id: 15, title: "חסידא · אשדוד", sub: "רובע ז׳ · מטבח · פינת אוכל · 54 נקודות", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "RE/MAX", company: "remax", tour: "chasida", hero: "/portfolio/chasida/01.jpg", gallery: ["/portfolio/chasida/01.jpg", "/portfolio/chasida/02.jpg", "/portfolio/chasida/03.jpg", "/portfolio/chasida/04.jpg", "/portfolio/chasida/05.jpg", "/portfolio/chasida/06.jpg", "/portfolio/chasida/07.jpg", "/portfolio/chasida/08.jpg", "/portfolio/chasida/09.jpg", "/portfolio/chasida/10.jpg"], tags: ["מטבח","פינת אוכל","סיור וירטואלי 3D"] },
  { id: 16, title: "שבט זבולון · אשדוד", sub: "רובע י״ב · מרפסת · סלון · מטבח · 32 נקודות", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "RE/MAX", company: "remax", tour: "shevet-zevulun", hero: "/portfolio/shevet-zevulun/cover.jpg", gallery: ["/portfolio/shevet-zevulun/01.jpg", "/portfolio/shevet-zevulun/02.jpg", "/portfolio/shevet-zevulun/03.jpg", "/portfolio/shevet-zevulun/04.jpg", "/portfolio/shevet-zevulun/05.jpg", "/portfolio/shevet-zevulun/06.jpg", "/portfolio/shevet-zevulun/07.jpg", "/portfolio/shevet-zevulun/08.jpg", "/portfolio/shevet-zevulun/09.jpg", "/portfolio/shevet-zevulun/10.jpg", "/portfolio/shevet-zevulun/11.jpg", "/portfolio/shevet-zevulun/12.jpg", "/portfolio/shevet-zevulun/13.jpg", "/portfolio/shevet-zevulun/14.jpg", "/portfolio/shevet-zevulun/15.jpg"], tags: ["מרפסת","סלון","מטבח","סיור וירטואלי 3D"] },
  { id: 17, title: "שבט לוי · אשדוד", sub: "רובע י״ב · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/shevet-levi-b/cover.jpg", gallery: ["/portfolio/shevet-levi-b/01.jpg", "/portfolio/shevet-levi-b/02.jpg", "/portfolio/shevet-levi-b/03.jpg", "/portfolio/shevet-levi-b/04.jpg", "/portfolio/shevet-levi-b/05.jpg", "/portfolio/shevet-levi-b/06.jpg", "/portfolio/shevet-levi-b/07.jpg", "/portfolio/shevet-levi-b/08.jpg", "/portfolio/shevet-levi-b/09.jpg", "/portfolio/shevet-levi-b/10.jpg", "/portfolio/shevet-levi-b/11.jpg", "/portfolio/shevet-levi-b/12.jpg", "/portfolio/shevet-levi-b/13.jpg", "/portfolio/shevet-levi-b/14.jpg"], tags: ["מרפסת","נוף","מטבח"] },
  { id: 18, title: "העצמאות · אשדוד", sub: "סיטי · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/atzmaut/cover.jpg", gallery: ["/portfolio/atzmaut/01.jpg", "/portfolio/atzmaut/02.jpg", "/portfolio/atzmaut/03.jpg", "/portfolio/atzmaut/04.jpg", "/portfolio/atzmaut/05.jpg", "/portfolio/atzmaut/06.jpg", "/portfolio/atzmaut/07.jpg", "/portfolio/atzmaut/08.jpg", "/portfolio/atzmaut/09.jpg", "/portfolio/atzmaut/10.jpg", "/portfolio/atzmaut/11.jpg", "/portfolio/atzmaut/12.jpg", "/portfolio/atzmaut/13.jpg", "/portfolio/atzmaut/14.jpg", "/portfolio/atzmaut/15.jpg", "/portfolio/atzmaut/16.jpg", "/portfolio/atzmaut/17.jpg", "/portfolio/atzmaut/18.jpg"], tags: ["מרפסת","סלון","מטבח"] },
  { id: 19, title: "הציונות · אשדוד", sub: "סיטי · אשדוד", city: "אשדוד", tag: "פנטהאוז", partner: "ReHouse", company: "rehouse", hero: "/portfolio/tzionut/cover.jpg", gallery: ["/portfolio/tzionut/01.jpg", "/portfolio/tzionut/02.jpg", "/portfolio/tzionut/03.jpg", "/portfolio/tzionut/04.jpg", "/portfolio/tzionut/05.jpg", "/portfolio/tzionut/06.jpg", "/portfolio/tzionut/07.jpg", "/portfolio/tzionut/08.jpg", "/portfolio/tzionut/09.jpg", "/portfolio/tzionut/10.jpg", "/portfolio/tzionut/11.jpg", "/portfolio/tzionut/12.jpg", "/portfolio/tzionut/13.jpg", "/portfolio/tzionut/14.jpg"], tags: ["פנטהאוז","בריכה","מרפסת גג","נוף"] },
  { id: 20, title: "הכלנית · אשדוד", sub: "רובע ח׳ · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/kalanit/cover.jpg", gallery: ["/portfolio/kalanit/01.jpg", "/portfolio/kalanit/02.jpg", "/portfolio/kalanit/03.jpg", "/portfolio/kalanit/04.jpg", "/portfolio/kalanit/05.jpg", "/portfolio/kalanit/06.jpg", "/portfolio/kalanit/07.jpg", "/portfolio/kalanit/08.jpg", "/portfolio/kalanit/09.jpg", "/portfolio/kalanit/10.jpg", "/portfolio/kalanit/11.jpg", "/portfolio/kalanit/12.jpg", "/portfolio/kalanit/13.jpg", "/portfolio/kalanit/14.jpg", "/portfolio/kalanit/15.jpg", "/portfolio/kalanit/16.jpg", "/portfolio/kalanit/17.jpg", "/portfolio/kalanit/18.jpg", "/portfolio/kalanit/19.jpg"], tags: ["מרפסת","סלון","מטבח"] },
  { id: 21, title: "אוסישקין · אשדוד", sub: "רובע ט״ו · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/ussishkin/cover.jpg", gallery: ["/portfolio/ussishkin/01.jpg", "/portfolio/ussishkin/02.jpg", "/portfolio/ussishkin/03.jpg", "/portfolio/ussishkin/04.jpg", "/portfolio/ussishkin/05.jpg", "/portfolio/ussishkin/06.jpg", "/portfolio/ussishkin/07.jpg", "/portfolio/ussishkin/08.jpg", "/portfolio/ussishkin/09.jpg", "/portfolio/ussishkin/10.jpg", "/portfolio/ussishkin/11.jpg", "/portfolio/ussishkin/12.jpg"], tags: ["מרפסת","סלון","מטבח"] },
  { id: 22, title: "פתח תקווה · אשדוד", sub: "רובע ט׳ · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/petah-tikva/cover.jpg", gallery: ["/portfolio/petah-tikva/01.jpg", "/portfolio/petah-tikva/02.jpg", "/portfolio/petah-tikva/03.jpg", "/portfolio/petah-tikva/04.jpg", "/portfolio/petah-tikva/05.jpg", "/portfolio/petah-tikva/06.jpg", "/portfolio/petah-tikva/07.jpg", "/portfolio/petah-tikva/08.jpg", "/portfolio/petah-tikva/09.jpg", "/portfolio/petah-tikva/10.jpg", "/portfolio/petah-tikva/11.jpg", "/portfolio/petah-tikva/12.jpg", "/portfolio/petah-tikva/13.jpg", "/portfolio/petah-tikva/14.jpg", "/portfolio/petah-tikva/15.jpg", "/portfolio/petah-tikva/16.jpg", "/portfolio/petah-tikva/17.jpg"], tags: ["מרפסת גג","סלון","מטבח"] },
  { id: 23, title: "שי עגנון · אשקלון", sub: "עתיקות · אשקלון", city: "אשקלון", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "JN6a8HHqRpX", hero: "/portfolio/agnon/cover.jpg", gallery: ["/portfolio/agnon/01.jpg", "/portfolio/agnon/02.jpg", "/portfolio/agnon/03.jpg", "/portfolio/agnon/04.jpg", "/portfolio/agnon/05.jpg", "/portfolio/agnon/06.jpg", "/portfolio/agnon/07.jpg", "/portfolio/agnon/08.jpg", "/portfolio/agnon/09.jpg", "/portfolio/agnon/10.jpg", "/portfolio/agnon/11.jpg"], tags: ["סלון","מטבח","סיור וירטואלי 3D"] },
  { id: 24, title: "נחל שניר · אשדוד", sub: "רובע י״א · אשדוד", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "mDADwNnNKtD", hero: "/portfolio/nahal-snir/cover.jpg", gallery: ["/portfolio/nahal-snir/01.jpg", "/portfolio/nahal-snir/02.jpg", "/portfolio/nahal-snir/03.jpg", "/portfolio/nahal-snir/04.jpg", "/portfolio/nahal-snir/05.jpg", "/portfolio/nahal-snir/06.jpg", "/portfolio/nahal-snir/07.jpg", "/portfolio/nahal-snir/08.jpg", "/portfolio/nahal-snir/09.jpg", "/portfolio/nahal-snir/10.jpg", "/portfolio/nahal-snir/11.jpg", "/portfolio/nahal-snir/12.jpg", "/portfolio/nahal-snir/13.jpg"], tags: ["סלון","מטבח","מרפסת","סיור וירטואלי 3D"] },
  { id: 25, title: "מיכה הנביא · אשדוד", sub: "רובע י׳ · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/micha-hanavi/cover.jpg", gallery: ["/portfolio/micha-hanavi/01.jpg", "/portfolio/micha-hanavi/02.jpg", "/portfolio/micha-hanavi/03.jpg", "/portfolio/micha-hanavi/04.jpg", "/portfolio/micha-hanavi/05.jpg", "/portfolio/micha-hanavi/06.jpg", "/portfolio/micha-hanavi/07.jpg", "/portfolio/micha-hanavi/08.jpg", "/portfolio/micha-hanavi/09.jpg", "/portfolio/micha-hanavi/10.jpg", "/portfolio/micha-hanavi/11.jpg", "/portfolio/micha-hanavi/12.jpg", "/portfolio/micha-hanavi/13.jpg", "/portfolio/micha-hanavi/14.jpg"], tags: ["סלון","מטבח"] },
  { id: 26, title: "הרב קוק · אשדוד", sub: "רובע ב׳ · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/harav-kook/cover.jpg", gallery: ["/portfolio/harav-kook/01.jpg", "/portfolio/harav-kook/02.jpg", "/portfolio/harav-kook/03.jpg", "/portfolio/harav-kook/04.jpg", "/portfolio/harav-kook/05.jpg", "/portfolio/harav-kook/06.jpg", "/portfolio/harav-kook/07.jpg", "/portfolio/harav-kook/08.jpg", "/portfolio/harav-kook/09.jpg", "/portfolio/harav-kook/10.jpg", "/portfolio/harav-kook/11.jpg", "/portfolio/harav-kook/12.jpg", "/portfolio/harav-kook/13.jpg", "/portfolio/harav-kook/14.jpg", "/portfolio/harav-kook/15.jpg", "/portfolio/harav-kook/16.jpg"], tags: ["סלון","מטבח"] },
  { id: 27, title: "האשכול · אשדוד", sub: "רובע א׳ · אשדוד", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "mWxuq2zaKdZ", hero: "/portfolio/haeshkol/cover.jpg", gallery: ["/portfolio/haeshkol/01.jpg", "/portfolio/haeshkol/02.jpg", "/portfolio/haeshkol/03.jpg", "/portfolio/haeshkol/04.jpg", "/portfolio/haeshkol/05.jpg", "/portfolio/haeshkol/06.jpg", "/portfolio/haeshkol/07.jpg", "/portfolio/haeshkol/08.jpg", "/portfolio/haeshkol/09.jpg", "/portfolio/haeshkol/10.jpg", "/portfolio/haeshkol/11.jpg", "/portfolio/haeshkol/12.jpg", "/portfolio/haeshkol/13.jpg", "/portfolio/haeshkol/14.jpg", "/portfolio/haeshkol/15.jpg", "/portfolio/haeshkol/16.jpg"], tags: ["נוף","מטבח","סלון","סיור וירטואלי 3D"] },
  { id: 28, title: "מילמן · אשדוד", sub: "רובע ו׳ · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/milman/cover.jpg", gallery: ["/portfolio/milman/01.jpg", "/portfolio/milman/02.jpg", "/portfolio/milman/03.jpg", "/portfolio/milman/04.jpg", "/portfolio/milman/05.jpg", "/portfolio/milman/06.jpg", "/portfolio/milman/07.jpg", "/portfolio/milman/08.jpg", "/portfolio/milman/09.jpg", "/portfolio/milman/10.jpg", "/portfolio/milman/11.jpg", "/portfolio/milman/12.jpg", "/portfolio/milman/13.jpg", "/portfolio/milman/14.jpg", "/portfolio/milman/15.jpg", "/portfolio/milman/16.jpg", "/portfolio/milman/17.jpg", "/portfolio/milman/18.jpg", "/portfolio/milman/19.jpg"], tags: ["סלון","מטבח","מרפסת"] },
  { id: 29, title: "חשוון · אשדוד", sub: "רובע י״ב · מרפסת · סלון · מטבח", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "RE/MAX", company: "remax", matterport: "idnfQzzt684", hero: "/portfolio/cheshvan/cover.jpg", gallery: ["/portfolio/cheshvan/01.jpg", "/portfolio/cheshvan/02.jpg", "/portfolio/cheshvan/03.jpg", "/portfolio/cheshvan/04.jpg", "/portfolio/cheshvan/05.jpg", "/portfolio/cheshvan/06.jpg", "/portfolio/cheshvan/07.jpg", "/portfolio/cheshvan/08.jpg", "/portfolio/cheshvan/09.jpg", "/portfolio/cheshvan/10.jpg", "/portfolio/cheshvan/11.jpg", "/portfolio/cheshvan/12.jpg", "/portfolio/cheshvan/13.jpg", "/portfolio/cheshvan/14.jpg", "/portfolio/cheshvan/15.jpg"], tags: ["מרפסת","סלון","מטבח","סיור וירטואלי 3D"] },
  { id: 30, title: "האשכולית · אשדוד", sub: "רובע ט״ז · מרפסת · סלון · מטבח", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "RE/MAX", company: "remax", matterport: "eo6fpaEEiA9", hero: "/portfolio/eshkolit/cover.jpg", gallery: ["/portfolio/eshkolit/01.jpg", "/portfolio/eshkolit/02.jpg", "/portfolio/eshkolit/03.jpg", "/portfolio/eshkolit/04.jpg", "/portfolio/eshkolit/05.jpg", "/portfolio/eshkolit/06.jpg", "/portfolio/eshkolit/07.jpg", "/portfolio/eshkolit/08.jpg", "/portfolio/eshkolit/09.jpg", "/portfolio/eshkolit/10.jpg", "/portfolio/eshkolit/11.jpg", "/portfolio/eshkolit/12.jpg", "/portfolio/eshkolit/13.jpg", "/portfolio/eshkolit/14.jpg", "/portfolio/eshkolit/15.jpg", "/portfolio/eshkolit/16.jpg"], tags: ["מרפסת","סלון","מטבח","סיור וירטואלי 3D"] },
];

const COVER_ID = 8;

// The selected-works grid shows these six covers only: three ReHouse apartments
// and three RE/MAX apartments. Every other property stays in PORTFOLIO so its
// gallery, tour, and drone-window link still open.
const SELECTED_WORK_IDS = [19, 27, 17, 30, 16, 11];

// Company of a card: explicit `company`, otherwise derived from `partner`.
const companyOf = (p) => p.company || (/re\s*\/?\s*max/i.test(p.partner || "") ? "remax" : /re\s*house/i.test(p.partner || "") ? "rehouse" : null);
// City of a card: explicit `city`, otherwise the last "·" segment of sub/title that names a known city.
const KNOWN_CITIES = ["אשדוד", "אשקלון", "יבנה"];
export const cityOf = (p) => p.city || [p.sub, p.title].map(t => (t || "").split("·").map(x => x.trim()).reverse().find(x => KNOWN_CITIES.includes(x))).find(Boolean) || "אחר";
// Region sections for a list of cards: אשדוד first, then אשקלון, יבנה, then any other city (A-Z); card order kept inside each section.
export const groupByCity = (cards) => {
  const order = ["אשדוד", "אשקלון", "יבנה"];
  const map = new Map();
  for (const p of cards) { const c = cityOf(p); if (!map.has(c)) map.set(c, []); map.get(c).push(p); }
  const rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
  return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, "he")).map(([city, items]) => ({ city, items }));
};
// Card tag line: the card's tags plus "3D TOUR" when it has a tour (unless a tag already says 3D).
// The partner/agency is never shown on a card: VISIO is presented purely as the photographer.
export const cardTagLine = (p) => {
  const tags = p.tags || [];
  const has3d = tags.some(t => /3D/i.test(t));
  return [...tags, !has3d && (p.tour || p.matterport) && "3D TOUR"].filter(Boolean).join(" · ");
};
const PORTFOLIO_FILTERS = [
  { id: "all", label: "הכל" },
  { id: "rehouse", label: "REHOUSE" },
  { id: "remax", label: "RE/MAX" },
];

/* ─── PORTFOLIO FILTER (segmented pill with sliding indicator) ─── */
function PortfolioFilter({ value, onChange }) {
  const barRef = useRef(null);
  const btnRefs = useRef({});
  const [ind, setInd] = useState({ left: 0, width: 0, ready: false });
  useLayoutEffect(() => {
    const place = () => {
      const b = btnRefs.current[value];
      if (b) setInd({ left: b.offsetLeft, width: b.offsetWidth, ready: true });
    };
    place();
    window.addEventListener("resize", place);
    const ro = typeof ResizeObserver !== "undefined" && barRef.current ? new ResizeObserver(place) : null;
    if (ro) ro.observe(barRef.current);
    if (document.fonts?.ready) document.fonts.ready.then(place);
    return () => { window.removeEventListener("resize", place); ro?.disconnect(); };
  }, [value]);
  return (
    <div className="visio-filter-wrap">
      <div className="visio-filter" role="tablist" aria-label="סינון עבודות לפי חברה" ref={barRef}>
        <span className="visio-filter-indicator" aria-hidden="true"
          style={{ transform: `translateX(${ind.left}px)`, width: ind.width, opacity: ind.ready ? 1 : 0 }} />
        {PORTFOLIO_FILTERS.map(f => (
          <button key={f.id} type="button" role="tab" aria-selected={value === f.id}
            ref={el => { btnRefs.current[f.id] = el; }}
            className={`visio-filter-btn${value === f.id ? " active" : ""}`}
            onClick={() => onChange(f.id)}>
            <Bidi>{f.label}</Bidi>
          </button>
        ))}
      </div>
    </div>
  );
}

const PARTNERS = [
  { id: "remax", name: "RE/MAX", sub: "ישראל", desc: "רשת התיווך הגדולה בעולם" },
  { id: "rehouse", name: "ReHouse", sub: 'נדל"ן', desc: 'חברת נדל"ן בוטיק' },
  { id: "lbd", name: "L.B.D", sub: "Real Estate", desc: "נדל״ן יוקרה" },
  { id: "agn", name: "א.ג.ן", sub: 'נדל"ן', desc: "סוכנות נדל״ן מובילה" },
];

// Current offer (prices before VAT). `id` is what the booking form sends (kept stable for the backend).
const PACKAGES = [
  { id: "PHOTOS", tier: "essential", name: "VISIO Essential", price: 365,
    desc: "כל מה שנכס צריך כדי לבלוט במודעה: 12 תמונות ממותגות עם שם הסוכן ו-12 ללא שם, מצולמות ב-Insta360 X4 ומוכנות לפרסום." },
  { id: "PHOTOS_VIDEO", tier: "motion", name: "VISIO Motion", price: 400,
    desc: "תמונות שמוכרות וסרטון שמספר: 12+12 תמונות ממותגות וסרטון שיווק שמציג את הנכס בתנועה, מוכן לרשתות ולמודעות." },
  { id: "FULL", tier: "signature", name: "VISIO Signature", price: 450, recommended: true,
    desc: "החבילה המלאה: 12+12 תמונות ממותגות, סרטון שיווק, צילומי רחפן DJI וסיור וירטואלי תלת-מימדי שמאפשר לקונים להתהלך בנכס מהבית.",
    note: "הסיור כרוך במנוי חודשי של ₪40" },
  { id: "INSTAGRAM", tier: "social", name: "VISIO Social", price: 120, unit: "לשעת עבודה",
    desc: "שיווק תוכן אורגני לאינסטגרם, בהתאמה אישית לסוכן או למשרד.",
    note: "רחפן בתוספת תשלום" },
];
const GEAR_LINE = "הצילומים נעשים במצלמת Insta360 X4 וברחפן DJI";


/* ═══════════════════════════════════
   PAGES
═══════════════════════════════════ */

/* ─── HOME ─── */
function HomeSection({ onNav }) {
  const workRef = useRef(null);
  const heroRef = useRef(null);
  useWorkPan(workRef);
  useHeroCopyFit(heroRef);
  const stills = PORTFOLIO.filter(p => PROPERTY_IMAGES[p.id] && p.id !== COVER_ID);
  const cover = PORTFOLIO.find(p => p.id === COVER_ID);
  const rail = stills.slice(0, 5);

  return (
    <>
      <section id="home" className="visio-hero-act" data-sc-act="pin" data-sc-span="2.15" ref={heroRef}>
        <div data-sc-stage className="visio-hero-stage">
          <div className="visio-hero-plate">
            <img src={PROPERTY_IMAGES[COVER_ID].hero} alt={cover?.title || "VISIO"} fetchPriority="high" decoding="async" />
          </div>
          <div className="visio-hero-scrim" aria-hidden="true" />
          <div className="visio-viewfinder" data-sc-viewfinder="" aria-hidden="true">
            <i /><i /><i /><i />
          </div>
          <div className="visio-cover-text visio-hero-copy">
            <div className="visio-kicker" data-sc-cue="0.02 0.4 0.5 0"><Bidi>VISIO PHOTOGRAPHY</Bidi></div>
            <h1 className="visio-cover-title visio-assemble">
              <span><span>נדל״ן.</span></span>
              <span><span>בצילום שמוכר.</span></span>
            </h1>
            <p className="visio-cover-sub"><Bidi>צילום נדל״ן מקצועי · AI Editing · סיורים וירטואליים · משלוח תמונות תוך 24 עד 48 שעות</Bidi></p>
            <div className="visio-cover-btns" data-sc-cue="0 0.78 0 0">
              <button className="visio-btn on-image" onClick={() => onNav("booking")}>הזמן צילום עכשיו</button>
              <button className="visio-btn on-image outline" onClick={() => onNav("portfolio")}>צפה בעבודות</button>
            </div>
          </div>
        </div>
      </section>

      <section className="visio-work-act" ref={workRef} aria-label="עבודות אחרונות">
        <div className="visio-work-sticky">
          <div className="visio-work-rail" data-visio-rail="">
            <div className="visio-work-intro">
              <div className="visio-kicker">עבודות אחרונות</div>
              <p className="visio-work-intro-title"><Bidi>צילום: VISIO</Bidi></p>
            </div>
            {rail.map((p) => (
              <button key={p.id} className="visio-story visio-work-card" onClick={() => onNav("portfolio")}>
                <StoryImage id={p.id} title={p.title} />
                {p.tag && <div className="visio-kicker" style={{ marginTop: 14 }}>{p.tag}</div>}
                <h3 className="visio-story-title">{p.title}</h3>
                <p className="visio-story-dek">{p.sub}</p>
                <div className="visio-credit"><Bidi>צילום: VISIO</Bidi></div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="visio-stats-wrap">
        <div className="visio-stats">
          <div className="visio-stat">
            <div className="visio-stat-num"><StatFigure value={500} suffix="+" duration={1300} /></div>
            <div className="visio-kicker muted">נכסים צולמו</div>
          </div>
          <div className="visio-stat">
            <div className="visio-stat-num"><span className="visio-stat-figure" dir="ltr" style={{ unicodeBidi: "isolate" }}>24–48</span></div>
            <div className="visio-kicker muted">שעות לתמונות</div>
          </div>
          <div className="visio-stat">
            <div className="visio-stat-num"><span className="visio-stat-figure" dir="ltr" style={{ unicodeBidi: "isolate" }}>12+12</span></div>
            <div className="visio-kicker muted">תמונות ממותגות בחבילה</div>
          </div>
        </div>
      </div>

      <section className="visio-section visio-partner-section" style={{ textAlign: "center" }} data-sc-in>
        <div className="visio-kicker muted" style={{ marginBottom: 36 }}>שותפים עסקיים</div>
        <div className="visio-partners">
          {PARTNERS.map(p => (
            <div key={p.id} className="visio-partner">
              <div className="visio-partner-name"><Bidi>{p.name}</Bidi></div>
            </div>
          ))}
        </div>
      </section>

      <section className="visio-section visio-wrap visio-cta" style={{ textAlign: "center", borderTop: `1px solid ${C.rule}` }} data-sc-in>
        <h2 className="visio-section-title">מוכן לשדרג את הנכס שלך?</h2>
        <p className="visio-section-sub" style={{ marginBottom: 28 }}>קבל הצעת מחיר תוך 24 עד 48 שעות · ללא התחייבות</p>
        <button className="visio-btn visio-cta-btn" onClick={() => onNav("booking")}>צרו קשר</button>
      </section>
    </>
  );
}

/* ─── LIGHTBOX ─── */
// RTL: "next" sits on the left (flex row reverses), so ArrowLeft / swipe right → next,
// ArrowRight / swipe left → previous. Esc closes. Body scroll is locked while open.
export const SWIPE_MIN_PX = 40;
export function swipeStep(dx, dy) {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx > 0 ? 1 : -1;
}
export function keyStep(key) {
  if (key === "ArrowLeft") return 1;
  if (key === "ArrowRight") return -1;
  return 0;
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
    <div className="visio-lightbox" role="dialog" aria-modal="true" onClick={onClose} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <img src={imgs[idx]} alt="" onClick={e => e.stopPropagation()} draggable={false} />
      <div className="visio-lightbox-controls" onClick={e => e.stopPropagation()}>
        {imgs.length > 1 && (
          <>
            <button className="visio-icon-btn" onClick={() => onStep(-1)} aria-label="הקודם">‹</button>
            <span className="visio-credit" dir="ltr">{idx + 1} / {imgs.length}</span>
            <button className="visio-icon-btn" onClick={() => onStep(1)} aria-label="הבא">›</button>
          </>
        )}
        <button className="visio-icon-btn" onClick={onClose} style={{ fontSize: 12, letterSpacing: ".2em" }}>✕ סגור</button>
      </div>
    </div>
  );
}

/* ─── PORTFOLIO ─── */
function PortfolioSection() {
  const [active, setActive] = useState(null);
  const [lightboxImgs, setLightboxImgs] = useState([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [company, setCompany] = useState("all");
  const selectedWorks = SELECTED_WORK_IDS.map((id) => PORTFOLIO.find((p) => p.id === id)).filter(Boolean);
  const shown = company === "all" ? selectedWorks : selectedWorks.filter((p) => companyOf(p) === company);
  const opener = selectedWorks[0];
  const openerSrc = opener?.hero || PROPERTY_IMAGES[opener?.id]?.hero;
  const skipRefresh = useRef(true);
  useEffect(() => {
    if (skipRefresh.current) { skipRefresh.current = false; return; }
    window.dispatchEvent(new Event("visio-sc-refresh"));
  }, [company]);

  const openGallery = (gallery) => { setLightboxImgs(gallery); setLightboxIdx(0); };
  const openGalleryRef = useRef(openGallery);
  openGalleryRef.current = openGallery;
  useEffect(() => {
    const onOpen = (event) => {
      const id = event.detail && event.detail.id;
      const property = PORTFOLIO.find((item) => item.id === id);
      if (!property) return;
      const imgs = PROPERTY_IMAGES[property.id];
      const gallery = property.gallery || (imgs && imgs.gallery) || [];
      if (gallery.length) openGalleryRef.current(gallery);
      const portfolio = document.getElementById("portfolio");
      if (portfolio) portfolio.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("visio-open-work", onOpen);
    return () => window.removeEventListener("visio-open-work", onOpen);
  }, []);
  const nImgs = lightboxImgs.length;
  const stepGallery = useCallback((d) => setLightboxIdx(i => (i + d + nImgs) % nImgs), [nImgs]);
  const closeGallery = useCallback(() => setLightboxImgs([]), []);

  const renderCard = (p, i) => {
    const imgs = PROPERTY_IMAGES[p.id];
    const hero = p.hero || imgs?.hero;
    const gallery = p.gallery || imgs?.gallery || [];
    const tourHref = p.tour
      ? `/tours/${p.tour}`
      : (p.matterport ? `https://my.matterport.com/show/?m=${p.matterport}` : null);
    return (
      <article key={p.id} className="visio-portfolio-card" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
        onMouseEnter={() => setActive(p.id)} onMouseLeave={() => setActive(null)}>

        <div className={`visio-portfolio-img-wrap${p.fit === "contain" ? " contain" : ""}`} style={{ cursor: gallery.length ? "zoom-in" : "default" }}
          onClick={() => { if (gallery.length) openGallery(gallery); }}>
          {hero ? (
            p.fit === "contain"
              ? <img src={hero} alt={p.title} loading="lazy" decoding="async" />
              : <div className="visio-photo-shift" data-sc-parallax="0.8"><img src={hero} alt={p.title} loading="lazy" decoding="async" /></div>
          ) : <div className="visio-placeholder"><Bidi>VISIO</Bidi></div>}
          {gallery.length > 1 && <div className="visio-img-label left">⊞ {gallery.length}</div>}

          {active === p.id && (tourHref || gallery.length > 0) && (
            <div className="visio-portfolio-hover" onClick={e => e.stopPropagation()}>
              {tourHref && (
                <a
                  className="visio-btn on-image"
                  href={tourHref}
                  style={{ textDecoration: "none" }}
                  {...(p.tour ? {} : { target: "_blank", rel: "noopener noreferrer", "aria-label": "סיור וירטואלי 3D, אתר חיצוני" })}
                >
                  {p.tour ? "▶ סיור וירטואלי 3D" : "▶ סיור וירטואלי 3D · אתר חיצוני"}
                </a>
              )}
              {gallery.length > 0 && (
                <button className="visio-btn on-image outline" onClick={() => openGallery(gallery)}>
                  ⊞ גלריית תמונות ({gallery.length})
                </button>
              )}
            </div>
          )}
        </div>

        {(tourHref || gallery.length > 0) && (
          <div className="visio-mobile-actions">
            {tourHref && (
              <a
                className="visio-btn"
                href={tourHref}
                style={{ textDecoration: "none" }}
                {...(p.tour ? {} : { target: "_blank", rel: "noopener noreferrer", "aria-label": "סיור וירטואלי, אתר חיצוני" })}
              >
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
          <h3 className="visio-story-title">{p.title}</h3>
          <p className="visio-story-dek">{p.sub}</p>
          <div className="visio-credit">
            <Bidi>{cardTagLine(p)}</Bidi>
          </div>
        </div>
      </article>
    );
  };

  return (
    <>
    <section id="portfolio" className="visio-opener-act" data-sc-act="pin" data-sc-span="2.4">
      <div data-sc-stage className="visio-opener-stage">
        {openerSrc && (
          <div className="visio-opener-photo" data-sc-parallax="-0.12">
            <img src={openerSrc} alt="" loading="lazy" decoding="async" />
          </div>
        )}
        <div className="visio-scene-scrim" aria-hidden="true" />
        <div className="visio-expose" data-sc-reveal="left" data-sc-reveal-at="0 1" aria-hidden="true" />
        <div className="visio-opener-copy">
          <div className="visio-kicker" data-sc-cue="0 1 0 0.12"><Bidi>PORTFOLIO</Bidi></div>
          <KineticTitle className="visio-section-title visio-opener-title" cue="0.04 0.88 0.2 0.12">עבודות נבחרות</KineticTitle>
          <p data-sc-cue="0 0.9 0 0.12">נכסי יוקרה · אשדוד · אשקלון · יבנה</p>
        </div>
      </div>
    </section>
    <section className="visio-section visio-portfolio-flow" data-sc-act="flow">
      <div data-sc-in>
        <SectionTitle sup="PORTFOLIO" title="עבודות נבחרות" sub="נכסי יוקרה · אשדוד · אשקלון · יבנה" />
      </div>
      <PortfolioFilter value={company} onChange={setCompany} />

      {/* Lightbox */}
      {lightboxImgs.length > 0 && (
        <Lightbox imgs={lightboxImgs} idx={lightboxIdx} onStep={stepGallery} onClose={closeGallery} />
      )}

      {company === "rehouse" ? (
        <div className="visio-region-list">
          {groupByCity(shown).map(({ city, items }) => (
            <section key={city} className="visio-region" aria-label={city} data-city={city}>
              <div className="visio-rule-head visio-region-head">
                <span className="visio-kicker">{city}</span>
                <span className="visio-region-count" dir="ltr">{items.length}</span>
              </div>
              <div className="visio-portfolio-grid" data-sc-in data-sc-stagger="40" key={`${company}-${city}`}>
                {items.map(renderCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="visio-portfolio-grid" data-sc-in data-sc-stagger="40" key={company}>
          {shown.map(renderCard)}
        </div>
      )}
      <p className="visio-copy visio-removal">
        בעל נכס שמבקש להסיר את הנכס מתיק העבודות מוזמן לפנות בוואטסאפ{" "}
        <a href="https://wa.me/972533523379">053-352-3379</a>
        {" "}או ל-<a href="mailto:yoni@visioisrael.com">yoni@visioisrael.com</a>. נסיר בתוך 7 ימים.
      </p>
    </section>
</>
  );
}

/* ─── PRICING ─── */
function PricingSection({ onNav }) {
  const [showVat, setShowVat] = useState(false);
  const p = (base) => fmt(showVat ? base * (1 + VAT) : base);

  return (
    <>
      <DroneFloors packages={PACKAGES} onNav={onNav} showVat={showVat} formatPrice={p} />
      <section id="pricing" className="visio-section" aria-label="חבילות ומחירים">
      {/* VAT toggle */}
      <div className="visio-switch">
        <span className="visio-credit" style={{ color: showVat ? C.muted : C.ink }}>ללא מע״מ</span>
        <button type="button" className="visio-switch-track" onClick={() => setShowVat(v => !v)} aria-pressed={showVat} aria-label="הצג מחירים כולל מע״מ">
          <span style={{ left: showVat ? 23 : 3 }} />
        </button>
        <span className="visio-credit" style={{ color: showVat ? C.ink : C.muted }}>כולל מע״מ (18%)</span>
      </div>

      {/* Cards */}
      <div className="visio-pricing-grid" data-sc-in data-sc-stagger="70">
        {PACKAGES.map(pkg => (
          <div key={pkg.id} className={`visio-price-card metal-${pkg.tier}${pkg.recommended ? " featured" : ""}`} data-sc-tilt="5">
            {pkg.recommended && <div className="visio-badge">מומלץ</div>}
            <img className={`visio-pkg-logo metal-${pkg.tier}`} src={`/packages/visio-${pkg.tier}.svg`} alt={pkg.name} width="96" height="96" loading="lazy" />
            <div className="visio-price-name visio-price-name-en" dir="ltr">{pkg.name}</div>
            <div className="visio-price">₪{p(pkg.price)}</div>
            <div className="visio-credit" style={{ marginTop: 10 }}>{pkg.unit ? `${pkg.unit} · ` : ""}{showVat ? "כולל מע״מ" : "+ מע״מ"}</div>
            <p className="visio-price-desc" dir="rtl"><Bidi numbers>{pkg.desc}</Bidi></p>
            {pkg.note && <p className="visio-price-note" dir="rtl"><Bidi numbers>{`* ${pkg.note}`}</Bidi></p>}
            <button className={`visio-btn block${pkg.recommended ? "" : " outline"}`} onClick={() => onNav("booking")} style={{ letterSpacing: ".1em" }}>
              הזמן עכשיו ← תשלום ביום הצילום
            </button>
          </div>
        ))}
      </div>
      <p className="visio-gear-line" dir="rtl"><Bidi>{GEAR_LINE}</Bidi></p>
    </section>
    </>
  );
}

/* ─── BOOKING ─── */
const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const HEB_DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const LAT_DAYS = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];

function BookingSection() {
  const today = new Date();
  const [yr, setYr] = useState(today.getFullYear());
  const [mo, setMo] = useState(today.getMonth());
  const [selDate, setSelDate] = useState(null);
  const [selSlot, setSelSlot] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", phone: "", address: "", pkg: "FULL", notes: "" });
  const [customerType, setCustomerType] = useState("");
  const [ownerConsent, setOwnerConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [wm, setWm] = useState({ agentPhone: "", logoFile: null, logoUrl: null, agentPhotoFile: null, agentPhotoUrl: null, wantAgentPhoto: false });
  const logoRef = useRef(null);
  const photoRef = useRef(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleFile = (field, urlField, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setWm(w => ({ ...w, [field]: file, [urlField]: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const getDIM = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirst = (y, m) => new Date(y, m, 1).getDay();
  const toKey = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const isWknd = (y, m, d) => { const w = new Date(y, m, d).getDay(); return w === 5 || w === 6; };
  const isPast = (y, m, d) => { const t = new Date(); t.setHours(0, 0, 0, 0); return new Date(y, m, d) < t; };
  const getHebDate = (y, m, d) => { try { return new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { day: "numeric" }).format(new Date(y, m, d)); } catch { return ""; } };

  const dim = getDIM(yr, mo), first = getFirst(yr, mo);
  const [sd, sm, sy] = selDate ? selDate.split("-").map(Number) : [];

  const completeBooking = async () => {
    setBookingLoading(true);
    setSubmitError("");
    const body = new FormData();
    body.append("name", form.name);
    body.append("phone", form.phone);
    body.append("address", form.address);
    body.append("pkg", form.pkg);
    body.append("date", selDate || "");
    body.append("time", selSlot || "");
    body.append("notes", form.notes);
    body.append("agentPhone", wm.agentPhone || "");
    body.append("customerType", customerType);
    body.append("ownerConsent", ownerConsent ? "yes" : "");
    body.append("bookingRef", `booking-${Date.now()}`);
    if (wm.logoFile) body.append("logo", wm.logoFile);
    if (wm.wantAgentPhoto && wm.agentPhotoFile) body.append("agentPhoto", wm.agentPhotoFile);
    try {
      const res = await fetch("/api/book-appointment", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setSubmitError(data.error || "לא הצלחנו לשלוח את הבקשה.");
        return;
      }
      setDone(true);
    } catch {
      setSubmitError("לא הצלחנו לשלוח את הבקשה.");
    } finally {
      setBookingLoading(false);
    }
  };

  useEffect(() => {
    if (step < 2) return;
    const id = step === 2 ? "booking-step-time" : "booking-step-form";
    document.getElementById(id)?.focus();
  }, [step]);

  const handleSubmitBooking = () => {
    if (!form.name || !form.phone || !form.address || !selDate || !selSlot) return;
    if (customerType !== "business" && customerType !== "private") {
      setSubmitError("יש לבחור אם המזמין עוסק או לקוח פרטי");
      return;
    }
    if (!ownerConsent) {
      setSubmitError("יש לאשר את הסכמת בעל הנכס");
      return;
    }
    completeBooking();
  };

  const formIncomplete = !form.name || !form.phone || !form.address || !customerType || !ownerConsent;

  if (done) return (
    <section className="visio-section" style={{ textAlign: "center" }}>
      <div className="visio-kicker"><Bidi>BOOKING CONFIRMED</Bidi></div>
      <h2 className="visio-section-title">בקשת ההזמנה התקבלה</h2>
      <p className="visio-copy" style={{ margin: 0 }}>נאשר את המועד בוואטסאפ בהקדם</p>
      <p className="visio-notice" style={{ maxWidth: 420, margin: "20px auto 0" }}>
        התשלום יתבצע ביום הצילום במזומן / ביט / העברה בנקאית
      </p>
      <div className="visio-done-grid">
        {[["תאריך", `${sd} ${HEB_MONTHS[sm - 1]} ${sy}`], ["שעה", selSlot], ["חבילה", PACKAGES.find(x => x.id === form.pkg)?.name || form.pkg], ["כתובת", form.address]].map(([l, v]) => (
          <div key={l}>
            <div className="visio-kicker muted" style={{ marginBottom: 6 }}>{l}</div>
            <div className="visio-serif" style={{ fontSize: 18, color: C.ink }}><Bidi>{v}</Bidi></div>
          </div>
        ))}
      </div>
      <button className="visio-btn outline" style={{ marginTop: 28 }} onClick={() => { setDone(false); setStep(1); setSelDate(null); setSelSlot(null); setCustomerType(""); setOwnerConsent(false); }}>
        ← קביעת צילום נוסף
      </button>
    </section>
  );

  return (
    <div className="visio-booking-wrap" id="booking">
      <div data-sc-in>
        <SectionTitle sup="BOOKING" title="תיאום מועד צילום" sub="בחר תאריך ושעה · מסונכרן עם יומן העסק" />
      </div>

      {/* Steps */}
      <div className="visio-steps">
        {["תאריך", "שעה", "פרטים"].map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: i < 2 ? "1" : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div className={`visio-step-dot${step > i + 1 ? " done" : step === i + 1 ? " current" : ""}`}>
                {step > i + 1 ? "✓" : i + 1}
              </div>
              <div className="visio-credit" style={{ color: step === i + 1 ? C.ink : C.muted }}>{s}</div>
            </div>
            {i < 2 && <div style={{ flex: 1, height: 1, background: C.rule, margin: "0 8px 22px" }} />}
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="visio-panel">
        <div className="visio-panel-head">
          <button className="visio-icon-btn" aria-label="החודש הקודם" onClick={() => { if (mo === 0) { setYr(y => y - 1); setMo(11); } else setMo(m => m - 1); }}>‹</button>
          <div className="visio-panel-title">{HEB_MONTHS[mo]} {yr}</div>
          <button className="visio-icon-btn" aria-label="החודש הבא" onClick={() => { if (mo === 11) { setYr(y => y + 1); setMo(0); } else setMo(m => m + 1); }}>›</button>
        </div>
        <div className="visio-cal-dow">
          {LAT_DAYS.map((d, i) => <div key={d} style={i >= 5 ? { color: C.faint } : undefined}><Bidi>{d}</Bidi></div>)}
        </div>
        <div className="visio-cal-grid" role="grid" aria-label="לוח תאריכים">
          {Array.from({ length: Math.ceil((first + dim) / 7) }, (_, week) => (
            <div key={week} role="row" style={{ display: "contents" }}>
              {Array.from({ length: 7 }, (_, col) => {
                const index = week * 7 + col;
                if (index < first || index >= first + dim) {
                  return <div key={col} role="gridcell" className="visio-calendar-day" />;
                }
                const day = index - first + 1;
                const key = toKey(yr, mo, day);
                const avail = !isWknd(yr, mo, day) && !isPast(yr, mo, day);
                const sel = selDate === key;
                const isT = key === toKey(today.getFullYear(), today.getMonth(), today.getDate());
                const cls = ["visio-calendar-day", avail ? "available" : "blocked", isT && "today", sel && "selected"].filter(Boolean).join(" ");
                const weekday = HEB_DAYS[new Date(yr, mo, day).getDay()];
                const onKeyDown = (event) => {
                  const stepBy = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 };
                  const delta = stepBy[event.key];
                  if (!delta) return;
                  event.preventDefault();
                  const dir = Math.sign(delta);
                  let next = day + delta;
                  while (next >= 1 && next <= dim) {
                    const target = document.querySelector(`[data-cal-day="${yr}-${mo}-${next}"]`);
                    if (target && !target.disabled) {
                      target.focus();
                      return;
                    }
                    next += dir;
                  }
                };
                return (
                  <div key={day} role="gridcell">
                    <button
                      type="button"
                      className={cls}
                      data-cal-day={`${yr}-${mo}-${day}`}
                      disabled={!avail}
                      aria-disabled={!avail}
                      aria-pressed={sel}
                      aria-label={`יום ${weekday} ${day} ב${HEB_MONTHS[mo]} ${yr}, ${avail ? "פנוי" : "חסום"}`}
                      onClick={() => { setSelDate(key); setStep(2); }}
                      onKeyDown={onKeyDown}
                    >
                      <span className="num">{day}</span>
                      <span className="heb">{getHebDate(yr, mo, day)}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="visio-panel-foot">
          <Bidi>● זמינות מסונכרנת עם Google Calendar · שישי-שבת חסומים</Bidi>
        </div>
      </div>

      {/* Time slots */}
      {step >= 2 && (
        <div className="visio-panel">
          <div className="visio-panel-head">
            <h2 id="booking-step-time" className="visio-panel-title" tabIndex={-1}>בחר שעה</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button type="button" className="visio-link" onClick={() => { setStep(1); setSelDate(null); setSelSlot(null); }}>שנה תאריך</button>
              <span className="visio-copy" style={{ color: C.ink }}>יום {sd && HEB_DAYS[new Date(sy, sm - 1, sd).getDay()]} · {sd} {sm && HEB_MONTHS[sm - 1]}</span>
            </div>
          </div>
          <div className="visio-time-slots">
            {SLOTS.map(sl => (
              <button key={sl} className={`visio-time-slot${selSlot === sl ? " selected" : ""}`} onClick={() => { setSelSlot(sl); setStep(3); }}>
                {sl}
                <small>פנוי</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {step >= 3 && (
        <div id="booking-form" className="visio-panel">
          <div className="visio-form-grid-2">
            {[["תאריך", `${sd} ${HEB_MONTHS[sm - 1]} ${sy}`], ["שעה", selSlot]].map(([l, v]) => (
              <div key={l}>
                <div className="visio-kicker muted" style={{ marginBottom: 4 }}>{l}</div>
                <div className="visio-serif" style={{ fontSize: 18, color: C.ink }}>{v}</div>
              </div>
            ))}
          </div>
          <form className="visio-form-body" onSubmit={(event) => { event.preventDefault(); handleSubmitBooking(); }}>
            <h2 id="booking-step-form" className="visio-panel-title" tabIndex={-1}>פרטים</h2>
            {/* Package select */}
            <div>
              <label className="visio-label" htmlFor="booking-pkg">חבילה</label>
              <select id="booking-pkg" className="visio-input" value={form.pkg} onChange={e => setForm(f => ({ ...f, pkg: e.target.value }))}>
                <option value="CONSULTATION">ייעוץ טלפוני — חינם</option>
                <option value="PHOTOS">VISIO Essential — ₪365 + מע״מ</option>
                <option value="PHOTOS_VIDEO">VISIO Motion — ₪400 + מע״מ</option>
                <option value="FULL">VISIO Signature — ₪450 + מע״מ</option>
                <option value="INSTAGRAM">VISIO Social — ₪120 לשעת עבודה + מע״מ</option>
              </select>
            </div>
            {[
              { id: "booking-name", key: "name", label: "שם מלא", ph: "שם פרטי + משפחה", dir: "rtl", auto: "name", type: "text" },
              { id: "booking-phone", key: "phone", label: "טלפון", ph: "05X-XXXXXXX", dir: "ltr", auto: "tel", type: "tel" },
              { id: "booking-address", key: "address", label: "כתובת הנכס", ph: "רחוב, מספר, עיר", dir: "rtl", auto: "street-address", type: "text" },
            ].map((field) => (
              <div key={field.key}>
                <label className="visio-label" htmlFor={field.id}>{field.label} *</label>
                <input
                  id={field.id}
                  className="visio-input"
                  type={field.type}
                  placeholder={field.ph}
                  dir={field.dir}
                  autoComplete={field.auto}
                  required
                  aria-required="true"
                  aria-describedby={submitError ? "booking-form-error" : undefined}
                  value={form[field.key]}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="visio-label" htmlFor="booking-notes">הערות לצלם</label>
              <textarea id="booking-notes" className="visio-input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {/* Watermark section */}
            <div style={{ border: `1px solid ${C.rule}`, background: C.bg2, padding: "20px 18px" }}>
              <div className="visio-panel-title" style={{ marginBottom: 4 }}>בראנדינג על התמונות</div>
              <div className="visio-copy" style={{ marginBottom: 18 }}>לוגו + טלפון + תמונת סוכן — יופיעו על כל תמונה · אופציונלי</div>

              <div style={{ marginBottom: 16 }}>
                <label className="visio-label" htmlFor="booking-agent-phone">מספר טלפון על התמונה</label>
                <input id="booking-agent-phone" className="visio-input" type="tel" autoComplete="tel" placeholder="05X-XXXXXXX" dir="ltr" value={wm.agentPhone} onChange={e => setWm(w => ({ ...w, agentPhone: e.target.value }))} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="visio-label" htmlFor="booking-logo">לוגו חברה / סוכנות (אופציונלי)</label>
                <input id="booking-logo" ref={logoRef} className="visio-file-input" type="file" accept="image/*" onChange={e => handleFile("logoFile", "logoUrl", e)} />
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="visio-btn outline" onClick={() => logoRef.current?.click()}>
                    {wm.logoUrl ? "← החלף לוגו" : "↑ העלה לוגו"}
                  </button>
                  {wm.logoUrl && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <img src={wm.logoUrl} alt="logo" style={{ height: 36, maxWidth: 100, objectFit: "contain", background: C.bg, padding: 4, border: `1px solid ${C.rule}` }} />
                    <span style={{ fontSize: 11, color: C.ink }}>✓ לוגו הועלה</span>
                  </div>}
                </div>
              </div>

              <div>
                <label className="visio-label" style={{ marginBottom: 10 }}>תמונת גוף של הסוכן</label>
                <button type="button" className="visio-check-row" onClick={() => setWm(w => ({ ...w, wantAgentPhoto: !w.wantAgentPhoto }))} aria-pressed={wm.wantAgentPhoto}>
                  <div className={`visio-checkbox${wm.wantAgentPhoto ? " checked" : ""}`}>
                    {wm.wantAgentPhoto ? "✓" : ""}
                  </div>
                  <div>
                    <div className="visio-copy" style={{ color: C.text }}>אני מעוניין שתמונת הסוכן תופיע על התמונות</div>
                    <div className="visio-copy visio-copy-soft">אופציונלית. תשמש רק לבאנר על התמונות.</div>
                  </div>
                </button>

                {wm.wantAgentPhoto && (
                  <div style={{ padding: 16, background: C.bg, border: `1px solid ${C.rule}` }}>
                    <label className="visio-label" htmlFor="booking-agent-photo">תמונת הסוכן</label>
                    <input id="booking-agent-photo" ref={photoRef} className="visio-file-input" type="file" accept="image/*" onChange={e => handleFile("agentPhotoFile", "agentPhotoUrl", e)} />
                    <button type="button" className="visio-btn outline" onClick={() => photoRef.current?.click()}>
                      {wm.agentPhotoUrl ? "← החלף תמונה" : "↑ העלה תמונת גוף"}
                    </button>
                    {wm.agentPhotoUrl && (
                      <div style={{ marginTop: 12, position: "relative", height: 140, background: "#1a1a1a", overflow: "hidden" }}>
                        {wm.logoUrl && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.6)", padding: "3px 6px" }}>
                          <img src={wm.logoUrl} alt="logo" style={{ height: 22, maxWidth: 72, objectFit: "contain", display: "block" }} />
                        </div>}
                        {wm.agentPhone && <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.7)", padding: "3px 10px", fontSize: 12, color: "#fff", letterSpacing: 1.5 }}>📞 {wm.agentPhone}</div>}
                        <img src={wm.agentPhotoUrl} alt="agent" style={{ position: "absolute", bottom: 0, left: 8, height: "85%", objectFit: "contain", objectPosition: "bottom" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {(!selDate || !selSlot) && <div className="visio-notice">← גלול למעלה ובחר תאריך ושעה</div>}
            {selDate && selSlot && formIncomplete && <div id="booking-missing" className="visio-notice" role="alert">מלאו שם, טלפון, כתובת, סוג מזמין והסכמת בעל הנכס</div>}
            <fieldset className="visio-fieldset">
              <legend className="visio-label">סוג המזמין *</legend>
              <div className="visio-choice">
                {Object.entries(CUSTOMER_TYPES).map(([value, label]) => (
                  <label key={value} htmlFor={`booking-customer-${value}`}>
                    <input
                      id={`booking-customer-${value}`}
                      type="radio"
                      name="customerType"
                      value={value}
                      required
                      checked={customerType === value}
                      onChange={() => setCustomerType(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="visio-copy">
              הפרטים שתמסור ישמשו לתיאום הצילום ולמתן השירות בלבד, ויישמרו אצל ספקי השירות שלנו (יומן, דואר ומסרים). אינך חייב על פי דין למסור אותם, אך בלעדיהם לא נוכל לתאם את הצילום. לפרטים: <a href="/privacy">מדיניות הפרטיות</a>
            </p>
            <p className="visio-copy">
              בלחיצה על אישור ההזמנה אני מאשר שקראתי את <a href="/terms">התקנון</a>
            </p>
            <label className="visio-check-row" htmlFor="booking-owner-consent">
              <input
                id="booking-owner-consent"
                className="visio-consent-input"
                type="checkbox"
                required
                aria-required="true"
                checked={ownerConsent}
                onChange={(event) => setOwnerConsent(event.target.checked)}
              />
              <span className="visio-copy" style={{ color: C.text }}>{OWNER_CONSENT_TEXT}</span>
            </label>
            {submitError && (
              <div id="booking-form-error" className="visio-notice" role="alert">
                {submitError}{" "}
                <a href="https://wa.me/972533523379">וואטסאפ</a>
              </div>
            )}
            <button className="visio-btn block" type="submit" disabled={bookingLoading}
              style={{ cursor: bookingLoading ? "wait" : "pointer", opacity: (formIncomplete || !selDate || !selSlot) ? 0.5 : 1 }}>
              {bookingLoading ? "שומר הזמנה..." : (!selDate || !selSlot) ? "בחר תאריך ושעה תחילה" : formIncomplete ? "השלימו את הפרטים ואת ההסכמה" : "אישור הזמנה →"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ─── CHARTER ─── */
function CharterSection() {
  return (
    <section id="charter" className="visio-section">
      <div data-sc-in>
        <SectionTitle sup="CHARTER" title="תנאי שירות" sub="שקיפות מלאה · תנאים ברורים" />
      </div>
      <div className="visio-narrow" data-sc-in>
        {PUBLIC_TERMS.map((term) => (
          <section key={term.title} className="visio-term">
            <h3 className="visio-term-title">{term.title}</h3>
            <p>{term.body}</p>
          </section>
        ))}
        <p className="visio-copy" style={{ marginTop: 24 }}>
          אותו נוסח מופיע גם <a href="/terms">בעמוד התקנון</a>.
        </p>
      </div>
    </section>
  );
}

/* ─── ABOUT ─── */
function AboutSection({ onNav }) {
  return (
    <>
    <section id="about" className="visio-section">
      <div data-sc-in>
        <SectionTitle sup="ABOUT" title="על VISIO" sub="צילום נדל״ן שמוכר" />
      </div>

      <div className="visio-narrow visio-article" data-sc-in>
        <div className="visio-kicker" style={{ marginBottom: 16 }}>החזון שלנו</div>
        <p className="visio-about-lead">
          בנינו את <span lang="en" dir="ltr">VISIO</span> לסוכנים שעובדים מהר. מזמינים בהודעה אחת, מתאמים מועד שנוח לכם ולבעלי הנכס, ומקבלים תמונות מוכנות לפרסום תוך 24 עד 48 שעות. צילום מקצועי, עיבוד מדויק, ונכס שמושך יותר פניות.
        </p>
      </div>
    </section>

    <LampLobby />

    <section className="visio-section">
      <div className="visio-narrow visio-article">
        <div className="visio-about-grid" data-sc-in data-sc-stagger="50">
          {[["מהירות", "הספקה תוך 24 עד 48 שעות מהצילום לתיקיית Drive"], ["דיוק", "כל תמונה מעובדת ידנית בנוסף ל-AI"], ["טכנולוגיה", "מצלמת Insta360 X4 · רחפן DJI · סיור וירטואלי 3D"], ["שותפות", "עובדים עם סוכנויות המובילות בדרום"]].map(([title, desc], i) => (
            <div key={title}>
              <div className="visio-about-num">{String(i + 1).padStart(2, "0")}</div>
              <div className="visio-term-title" style={{ marginBottom: 8 }}>{title}</div>
              <div className="visio-copy"><Bidi>{desc}</Bidi></div>
            </div>
          ))}
        </div>

        <div className="visio-rule-head"><span className="visio-kicker">שותפים עסקיים</span></div>
        <div className="visio-partners" style={{ marginBottom: 48 }}>
          {PARTNERS.map(p => (
            <div key={p.id} style={{ textAlign: "center" }}>
              <div className="visio-partner-name"><Bidi>{p.name}</Bidi></div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center" }}>
          <button className="visio-btn" onClick={() => onNav("booking")}>צרו קשר עכשיו</button>
        </div>
      </div>
    </section>
</>
  );
}

/* ═══════════════════════════════════
   NAVBAR
═══════════════════════════════════ */
const NAV = [
  { id: "home", label: "בית" },
  { id: "portfolio", label: "עבודות" },
  { id: "pricing", label: "חבילות" },
  { id: "booking", label: "הזמן" },
  { id: "charter", label: "תקנון", href: "/terms" },
  { id: "about", label: "אודות" },
];

/* ═══════════════════════════════════
   APP
═══════════════════════════════════ */
export default function VisioApp() {
  const [active, setActive] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  useScrollCraft();

  const releaseMenuScroll = () => {
    const body = document.body;
    if (!body.classList.contains("visio-menu-open")) return;
    const top = Math.abs(parseInt(body.style.top || "0", 10)) || 0;
    body.classList.remove("visio-menu-open");
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    body.style.width = "";
    window.scrollTo(0, top);
  };

  const nav = (id) => {
    releaseMenuScroll();
    setMenuOpen(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (id === "home") {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      setActive("home");
      return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActive(id);
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const y = window.scrollY;
    const body = document.body;
    body.classList.add("visio-menu-open");
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      if (!body.classList.contains("visio-menu-open")) return;
      const top = Math.abs(parseInt(body.style.top || "0", 10)) || 0;
      body.classList.remove("visio-menu-open");
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      window.scrollTo(0, top);
    };
  }, [menuOpen]);

  useEffect(() => {
    const ids = ["home", "portfolio", "pricing", "booking", "charter", "about"];
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (hit?.target?.id) setActive(hit.target.id);
    }, { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.15, 0.4] });
    els.forEach((el) => io.observe(el));
    const hash = window.location.hash.replace("#", "");
    if (hash && document.getElementById(hash)) {
      document.getElementById(hash).scrollIntoView({ behavior: "auto", block: "start" });
    }
    return () => io.disconnect();
  }, []);

  return (
    <div className="visio-public">
      {/* ── MASTHEAD ── */}
      <header>
        <div className="visio-topbar">
          <div className="visio-topbar-inner">
            <span className="visio-topbar-text"><Bidi>צילום נדל״ן מקצועי · AI Editing · סיורים וירטואליים</Bidi></span>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginInlineStart: "auto" }}>
              <button className="visio-link" onClick={() => nav("booking")}>הזמן צילום</button>
              <ThemeToggle />
            </div>
          </div>
        </div>
        <div className="visio-masthead-block">
          <button className="visio-masthead" onClick={() => nav("home")} aria-label="VISIO — דף הבית"><Bidi>VISIO</Bidi></button>
          <div className="visio-masthead-tag visio-kicker muted"><Bidi>REAL ESTATE PHOTOGRAPHY</Bidi></div>
        </div>
      </header>

      {/* ── NAVBAR ── */}
      <nav className="visio-nav">
        <div className="visio-nav-inner">
          <button type="button" className="nav-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label={menuOpen ? "סגור תפריט" : "תפריט"} aria-expanded={menuOpen} aria-controls="visio-drawer">{menuOpen ? "✕" : "☰"}</button>
          <button className="visio-nav-mini" onClick={() => nav("home")} aria-label="VISIO — דף הבית"><Bidi>VISIO</Bidi></button>
          <div className="nav-desktop">
            {NAV.map(n => (
              n.href
                ? <a key={n.id} className="visio-nav-link" href={n.href}>{n.label}</a>
                : <button key={n.id} type="button" className={`visio-nav-link${active === n.id ? " active" : ""}`} onClick={() => nav(n.id)}>{n.label}</button>
            ))}
          </div>
        </div>
      </nav>

      {menuOpen && <div className="nav-overlay" onClick={() => setMenuOpen(false)} />}
      <aside id="visio-drawer" className={`nav-drawer ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen} inert={menuOpen ? undefined : ""}>
        <div className="nav-drawer-mark"><Bidi>VISIO</Bidi></div>
        {NAV.map(n => (
          n.href
            ? <a key={n.id} className="nav-drawer-btn" href={n.href}>{n.label}</a>
            : <button key={n.id} type="button" className={`nav-drawer-btn ${active === n.id ? "active" : ""}`} onClick={() => nav(n.id)}>{n.label}</button>
        ))}
        <div style={{ padding: 24 }}>
          <button className="visio-btn block" onClick={() => nav("booking")}>הזמן צילום</button>
        </div>
      </aside>

      {/* ── CONTENT ── */}
      <main className="page-content">
        <HomeSection onNav={nav} />
        <PortfolioSection />
        <PricingSection onNav={nav} />
        <BookingSection />
        <CharterSection />
        <AboutSection onNav={nav} />
      </main>

      <a className="visio-wa" href="https://wa.me/972533523379" target="_blank" rel="noreferrer" aria-label="וואטסאפ 053-352-3379">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path fill="currentColor" d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10.1 10.1 0 0 0 4.65 1.12h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 14.15c-.24.68-1.4 1.25-1.94 1.33-.5.07-1.12.1-1.81-.11-.41-.13-.95-.31-1.63-.61-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.27.64-.39 1.02-.39.12 0 .23 0 .33.01.3.01.44.03.64.49.24.57.82 1.98.89 2.12.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.17-.29.37-.41.5-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.89 1.05.93 1.93 1.22 2.2 1.36.28.14.44.12.6-.07.16-.19.7-.81.88-1.09.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.46.21.53.32.07.12.07.68-.17 1.36z" />
        </svg>
      </a>

      {/* ── FOOTER ── */}
      <footer className="visio-footer">
        <button className="visio-footer-mark" onClick={() => nav("home")} aria-label="VISIO — דף הבית"><Bidi>VISIO</Bidi></button>
        <p className="visio-footer-tag">נדל״ן. בצילום שמוכר.</p>
        <div className="visio-footer-nav">
          {NAV.map(n => (
            n.href
              ? <a key={n.id} href={n.href}>{n.label}</a>
              : <button key={n.id} type="button" onClick={() => nav(n.id)}>{n.label}</button>
          ))}
          <a href="/privacy">מדיניות פרטיות</a>
          <a href="/accessibility">הצהרת נגישות</a>
        </div>
        <p className="visio-footer-business">VISIO – יונתן בוזגלו, עוסק מורשה 206586869, yoni@visioisrael.com, 053-352-3379</p>
        <p className="visio-footer-legal">
          <a href="https://wa.me/972533523379">וואטסאפ 053-352-3379</a>
          {" · © 2026 VISIO – יונתן בוזגלו. כל הזכויות בתמונות, בסרטונים ובסיורים שמורות. אין להעתיק או להשתמש בהם ללא אישור בכתב"}
        </p>
      </footer>
    </div>
  );
}
