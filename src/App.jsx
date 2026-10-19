"use client";

import { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";

import Image from "next/image";
import { C } from "./theme/colors.js";
import ThemeToggle from "./theme/ThemeToggle.jsx";
import { TERMS_VERSION } from "../lib/legal/versions.js";
const PROPERTY_IMAGES = {
  1: { hero: "/portfolio-featured/1/hero.jpg", gallery: ["/portfolio-featured/1/g01.jpg"] },
  2: { hero: "/portfolio-featured/2/hero.jpg", gallery: ["/portfolio-featured/2/g01.jpg"] },
  7: { hero: "/portfolio-featured/7/hero.jpg", gallery: ["/portfolio-featured/7/g01.jpg", "/portfolio-featured/7/g02.jpg", "/portfolio-featured/7/g03.jpg", "/portfolio-featured/7/g04.jpg", "/portfolio-featured/7/g05.jpg", "/portfolio-featured/7/g06.jpg", "/portfolio-featured/7/g07.jpg", "/portfolio-featured/7/g08.jpg"] },
    5: { hero: "/portfolio-featured/5/hero.jpg", gallery: ["/portfolio-featured/5/g01.jpg", "/portfolio-featured/5/g02.jpg", "/portfolio-featured/5/g03.jpg", "/portfolio-featured/5/g04.jpg", "/portfolio-featured/5/g05.jpg", "/portfolio-featured/5/g06.jpg"] },
  8: { hero: "/portfolio-featured/8/hero.jpg", gallery: ["/portfolio-featured/8/g01.jpg", "/portfolio-featured/8/g02.jpg", "/portfolio-featured/8/g03.jpg", "/portfolio-featured/8/g04.jpg", "/portfolio-featured/8/g05.jpg", "/portfolio-featured/8/g06.jpg", "/portfolio-featured/8/g07.jpg", "/portfolio-featured/8/g08.jpg"] },
  9: { hero: "/portfolio-featured/9/hero.jpg", gallery: ["/portfolio-featured/9/g01.jpg", "/portfolio-featured/9/g02.jpg", "/portfolio-featured/9/g03.jpg", "/portfolio-featured/9/g04.jpg", "/portfolio-featured/9/g05.jpg", "/portfolio-featured/9/g06.jpg", "/portfolio-featured/9/g07.jpg", "/portfolio-featured/9/g08.jpg"] },
};


/* ════════════════════════════════════════════════
   VISIO — Real Estate Photography Agency
   Editorial monochrome aesthetic · RTL Hebrew
════════════════════════════════════════════════ */


const fmt = (n) => Math.round(n).toLocaleString("he-IL");
const VAT = 0.18;
// Money with VAT can be fractional (e.g. ₪40 × 1.18 = ₪47.20) — never round it away.
const fmtMoney = (n) => {
  const r = Math.round(n * 100) / 100;
  return r.toLocaleString("he-IL", Number.isInteger(r) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const Money = ({ n }) => <bdi dir="ltr">₪{fmtMoney(n)}</bdi>;

/* ─── BIDI ─── */
// Latin runs (incl. leading digits like "4K" and inner separators like "RE/MAX", "9:16")
// are isolated so neighbouring Hebrew punctuation and word order don't flip.
const LATIN_RUN = /\d*[A-Za-z][A-Za-z0-9]*(?:[ ./&'+:-]+[A-Za-z0-9]+)*/g;

// Pricing copy also isolates number runs (12+12, ₪40) so they never reorder neighbouring Hebrew.
const LATIN_OR_NUM_RUN = /\d+[-–]\d+|₪?\d*[A-Za-z][A-Za-z0-9]*(?:[ ./&'+:-]+[A-Za-z0-9]+)*|₪?\d+(?:\+\d+)?/g;
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
      <h1 className="visio-section-title"><Bidi>{title}</Bidi></h1>
      {sub && <p className="visio-section-sub"><Bidi>{sub}</Bidi></p>}
    </div>
  );
}

/* ─── STORY IMAGE ─── */
function StoryImage({ id, title }) {
  const src = PROPERTY_IMAGES[id]?.hero;
  return (
    <div className="visio-story-img">
      {src ? <Image src={src} alt={title} width={1600} height={1200} sizes="(max-width: 900px) 100vw, 50vw" /> : <div className="visio-placeholder"><Bidi>VISIO</Bidi></div>}
    </div>
  );
}

/* ─── DATA ─── */
const PORTFOLIO = [
  { id: 1, title: "וילה · אשדוד", sub: "דקר 72 · בריכה פרטית · דק עץ", city: "אשדוד", tag: "רחפן + סיור וירטואלי", partner: "ReHouse", matterport: "ooDYEMx6TCr", tags: ["בריכה","דק עץ","סיור וירטואלי"] },
  { id: 2, title: "שבט לוי 1 · אשדוד", sub: "מרפסת פינורמית · נוף ים", city: "אשדוד", partner: "ReHouse", matterport: "g1C8Upb3G6q", tags: ["מרפסת"] },
  { id: 3, title: "נחל שניר 21 · אשדוד", sub: "קיר שיש · פרקט אירופאי", city: "אשדוד", tag: "בוטיק", partner: "ReHouse", company: "rehouse", matterport: "Z76pbSkPMXX", hero: "/portfolio/nahal-snir-21/01.jpg", gallery: ["/portfolio/nahal-snir-21/01.jpg", "/portfolio/nahal-snir-21/02.jpg", "/portfolio/nahal-snir-21/03.jpg", "/portfolio/nahal-snir-21/04.jpg", "/portfolio/nahal-snir-21/05.jpg", "/portfolio/nahal-snir-21/06.jpg", "/portfolio/nahal-snir-21/07.jpg", "/portfolio/nahal-snir-21/08.jpg", "/portfolio/nahal-snir-21/09.jpg", "/portfolio/nahal-snir-21/10.jpg"], tags: ["קיר שיש","פרקט","בוטיק"] },
  { id: 4, title: "בלפור 7 · אשדוד", sub: "לובי יוקרה · שיש איטלקי", city: "אשדוד", tag: "לובי יוקרה", partner: "ReHouse", company: "rehouse", matterport: "9YJGFmX8KbJ", hero: "/portfolio/balfour-7/01.jpg", gallery: ["/portfolio/balfour-7/01.jpg", "/portfolio/balfour-7/02.jpg", "/portfolio/balfour-7/03.jpg", "/portfolio/balfour-7/04.jpg", "/portfolio/balfour-7/05.jpg", "/portfolio/balfour-7/06.jpg", "/portfolio/balfour-7/07.jpg", "/portfolio/balfour-7/08.jpg", "/portfolio/balfour-7/09.jpg", "/portfolio/balfour-7/10.jpg"], tags: ["לובי יוקרה","שיש"] },
  { id: 5, title: "הפטל 17 · יבנה", sub: "גינה · פרגולה · עצי לימון", city: "יבנה", tag: "דירת גן", partner: "ReHouse", matterport: "AF18oBWVfrm", tags: ["גינה","פרגולה","עצי לימון"] },
  { id: 6, title: "המשוט 8 · אשדוד", sub: "גינה · שיש · סלון מרווח", city: "אשדוד", tag: "דירת גן", partner: "ReHouse", company: "rehouse", matterport: "C6Uvbihrqvm", hero: "/portfolio/hamashot-8/01.jpg", gallery: ["/portfolio/hamashot-8/01.jpg", "/portfolio/hamashot-8/02.jpg", "/portfolio/hamashot-8/03.jpg", "/portfolio/hamashot-8/04.jpg", "/portfolio/hamashot-8/05.jpg", "/portfolio/hamashot-8/06.jpg", "/portfolio/hamashot-8/07.jpg", "/portfolio/hamashot-8/08.jpg", "/portfolio/hamashot-8/09.jpg"], tags: ["גינה","שיש","סלון"] },
  { id: 7, title: "אבות ישורון 18 · אשדוד", sub: "דירת גן · 2 גינות · פרגולה · סלון מעוצב", city: "אשדוד", tag: "דירת גן + פרגולה", partner: "ReHouse", matterport: "Xh34KkeoLb5", tags: ["דירת גן","גינה","פרגולה","סלון מרווח"] },
  { id: 8, title: "קרן היסוד 43 · אשדוד", sub: "פנטהאוז · גג יוקרתי · בר + מטבח חיצוני", city: "אשדוד", tag: "פנטהאוז + גג", partner: "ReHouse", matterport: "so6PszZrxgx", tags: ["פנטהאוז","גג מעוצב","בר","סיור וירטואלי"] },
  { id: 9, title: "הגלים 11 · אשדוד", sub: "וילה פרטית · גינה מטופחת · חדר הורים מפנק", city: "אשדוד", tag: "וילה", partner: "ReHouse", tags: ["וילה","גינה","חדר הורים","מרוהטת"] },
  { id: 10, title: "דירה · אשדוד", sub: "שבט לוי 11 · מרפסת · סלון · מטבח · 44 נקודות", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "RE/MAX", company: "remax", matterport: "Hkg7xrnXgoM", tour: "ashdod-apartment", fit: "contain", hero: "/portfolio/shevet-levi-11/16.jpg", gallery: ["/portfolio/shevet-levi-11/16.jpg", "/portfolio/shevet-levi-11/17.jpg", "/portfolio/shevet-levi-11/18.jpg", "/portfolio/shevet-levi-11/19.jpg", "/portfolio/shevet-levi-11/20.jpg", "/portfolio/shevet-levi-11/21.jpg", "/portfolio/shevet-levi-11/13.jpg", "/portfolio/shevet-levi-11/14.jpg", "/portfolio/shevet-levi-11/15.jpg", "/portfolio/shevet-levi-11/09.jpg", "/portfolio/shevet-levi-11/10.jpg", "/portfolio/shevet-levi-11/11.jpg", "/portfolio/shevet-levi-11/12.jpg", "/portfolio/shevet-levi-11/01.jpg", "/portfolio/shevet-levi-11/02.jpg", "/portfolio/shevet-levi-11/03.jpg", "/portfolio/shevet-levi-11/04.jpg", "/portfolio/shevet-levi-11/05.jpg", "/portfolio/shevet-levi-11/06.jpg", "/portfolio/shevet-levi-11/07.jpg", "/portfolio/shevet-levi-11/08.jpg"], tags: ["מרפסת","סלון","מטבח","סיור וירטואלי"] },
  { id: 11, title: "רוטשילד 23 · אשדוד", sub: "רובע ט״ו", city: "אשדוד", tag: "דירה", partner: "RE/MAX", company: "remax", hero: "/portfolio/rothschild-23/01.jpg", gallery: ["/portfolio/rothschild-23/01.jpg", "/portfolio/rothschild-23/02.jpg", "/portfolio/rothschild-23/03.jpg", "/portfolio/rothschild-23/04.jpg", "/portfolio/rothschild-23/05.jpg", "/portfolio/rothschild-23/06.jpg", "/portfolio/rothschild-23/07.jpg", "/portfolio/rothschild-23/08.jpg", "/portfolio/rothschild-23/09.jpg"], tags: ["סלון","מרפסת","מטבח"] },
  { id: 12, title: "נחל לכיש 45 · אשדוד", sub: "רובע י״א", city: "אשדוד", tag: "דירה", partner: "RE/MAX", company: "remax", hero: "/portfolio/nahal-lachish-45/01.jpg", gallery: ["/portfolio/nahal-lachish-45/01.jpg", "/portfolio/nahal-lachish-45/02.jpg", "/portfolio/nahal-lachish-45/03.jpg", "/portfolio/nahal-lachish-45/04.jpg", "/portfolio/nahal-lachish-45/05.jpg", "/portfolio/nahal-lachish-45/06.jpg", "/portfolio/nahal-lachish-45/07.jpg", "/portfolio/nahal-lachish-45/08.jpg", "/portfolio/nahal-lachish-45/09.jpg", "/portfolio/nahal-lachish-45/10.jpg"], tags: ["סלון","מטבח","פינת אוכל"] },
  { id: 13, title: "יהויכין 11 · אשדוד", sub: "רובע י״ג", city: "אשדוד", tag: "דירה", partner: "RE/MAX", company: "remax", hero: "/portfolio/yehoyachin-11/01.jpg", gallery: ["/portfolio/yehoyachin-11/01.jpg", "/portfolio/yehoyachin-11/02.jpg", "/portfolio/yehoyachin-11/03.jpg", "/portfolio/yehoyachin-11/04.jpg", "/portfolio/yehoyachin-11/05.jpg", "/portfolio/yehoyachin-11/06.jpg", "/portfolio/yehoyachin-11/07.jpg", "/portfolio/yehoyachin-11/08.jpg", "/portfolio/yehoyachin-11/09.jpg"], tags: ["סלון","מרפסת"] },
  { id: 14, title: "ביאליק 46 · אשדוד", sub: "רובע ה׳", city: "אשדוד", tag: "דירה", partner: "RE/MAX", company: "remax", hero: "/portfolio/bialik-46/01.jpg", gallery: ["/portfolio/bialik-46/01.jpg", "/portfolio/bialik-46/02.jpg", "/portfolio/bialik-46/03.jpg", "/portfolio/bialik-46/04.jpg", "/portfolio/bialik-46/05.jpg", "/portfolio/bialik-46/06.jpg"], tags: ["סלון","מטבח","פינת אוכל"] },
  { id: 15, title: "חסידא 17 · אשדוד", sub: "רובע ז׳", city: "אשדוד", tag: "דירה", partner: "RE/MAX", company: "remax", hero: "/portfolio/chasida-17/01.jpg", gallery: ["/portfolio/chasida-17/01.jpg", "/portfolio/chasida-17/02.jpg", "/portfolio/chasida-17/03.jpg", "/portfolio/chasida-17/04.jpg", "/portfolio/chasida-17/05.jpg", "/portfolio/chasida-17/06.jpg", "/portfolio/chasida-17/07.jpg", "/portfolio/chasida-17/08.jpg", "/portfolio/chasida-17/09.jpg", "/portfolio/chasida-17/10.jpg"], tags: ["מטבח","פינת אוכל"] },
  { id: 16, title: "שבט זבולון 5 - גיא רוזן", sub: "רובע י״ב · מרפסת · סלון · מטבח · 32 נקודות", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "RE/MAX", company: "remax", tour: "shevet-zevulun", hero: "/portfolio/shevet-zevulun/cover.jpg", gallery: ["/portfolio/shevet-zevulun/01.jpg", "/portfolio/shevet-zevulun/02.jpg", "/portfolio/shevet-zevulun/03.jpg", "/portfolio/shevet-zevulun/04.jpg", "/portfolio/shevet-zevulun/05.jpg", "/portfolio/shevet-zevulun/06.jpg", "/portfolio/shevet-zevulun/07.jpg", "/portfolio/shevet-zevulun/08.jpg", "/portfolio/shevet-zevulun/09.jpg", "/portfolio/shevet-zevulun/10.jpg", "/portfolio/shevet-zevulun/11.jpg", "/portfolio/shevet-zevulun/12.jpg", "/portfolio/shevet-zevulun/13.jpg", "/portfolio/shevet-zevulun/14.jpg", "/portfolio/shevet-zevulun/15.jpg"], tags: ["מרפסת","סלון","מטבח","סיור וירטואלי 3D"] },
  { id: 17, title: "שבט לוי 4 - יאן שינדלמן", sub: "רובע י״ב · אשדוד", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "xZ4M9pKzoBr", hero: "/portfolio/shevet-levi-4/cover.jpg", gallery: ["/portfolio/shevet-levi-4/01.jpg", "/portfolio/shevet-levi-4/02.jpg", "/portfolio/shevet-levi-4/03.jpg", "/portfolio/shevet-levi-4/04.jpg", "/portfolio/shevet-levi-4/05.jpg", "/portfolio/shevet-levi-4/06.jpg", "/portfolio/shevet-levi-4/07.jpg", "/portfolio/shevet-levi-4/08.jpg", "/portfolio/shevet-levi-4/09.jpg", "/portfolio/shevet-levi-4/10.jpg", "/portfolio/shevet-levi-4/11.jpg", "/portfolio/shevet-levi-4/12.jpg", "/portfolio/shevet-levi-4/13.jpg", "/portfolio/shevet-levi-4/14.jpg"], tags: ["מרפסת","נוף","מטבח","סיור וירטואלי 3D"] },
  { id: 18, title: "העצמאות 21 - יאן שינדלמן", sub: "סיטי · אשדוד", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "eqKC1zuQDfa", hero: "/portfolio/atzmaut-21/cover.jpg", gallery: ["/portfolio/atzmaut-21/01.jpg", "/portfolio/atzmaut-21/02.jpg", "/portfolio/atzmaut-21/03.jpg", "/portfolio/atzmaut-21/04.jpg", "/portfolio/atzmaut-21/05.jpg", "/portfolio/atzmaut-21/06.jpg", "/portfolio/atzmaut-21/07.jpg", "/portfolio/atzmaut-21/08.jpg", "/portfolio/atzmaut-21/09.jpg", "/portfolio/atzmaut-21/10.jpg", "/portfolio/atzmaut-21/11.jpg", "/portfolio/atzmaut-21/12.jpg", "/portfolio/atzmaut-21/13.jpg", "/portfolio/atzmaut-21/14.jpg", "/portfolio/atzmaut-21/15.jpg", "/portfolio/atzmaut-21/16.jpg", "/portfolio/atzmaut-21/17.jpg", "/portfolio/atzmaut-21/18.jpg"], tags: ["מרפסת","סלון","מטבח","סיור וירטואלי 3D"] },
  { id: 19, title: "הציונות 55 - יאן שינדלמן", sub: "סיטי · אשדוד", city: "אשדוד", tag: "פנטהאוז + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "m1ArnEzVJCY", hero: "/portfolio/tzionut-55/cover.jpg", gallery: ["/portfolio/tzionut-55/01.jpg", "/portfolio/tzionut-55/02.jpg", "/portfolio/tzionut-55/03.jpg", "/portfolio/tzionut-55/04.jpg", "/portfolio/tzionut-55/05.jpg", "/portfolio/tzionut-55/06.jpg", "/portfolio/tzionut-55/07.jpg", "/portfolio/tzionut-55/08.jpg", "/portfolio/tzionut-55/09.jpg", "/portfolio/tzionut-55/10.jpg", "/portfolio/tzionut-55/11.jpg", "/portfolio/tzionut-55/12.jpg", "/portfolio/tzionut-55/13.jpg", "/portfolio/tzionut-55/14.jpg"], tags: ["פנטהאוז","בריכה","מרפסת גג","נוף","סיור וירטואלי 3D"] },
  { id: 20, title: "הכלנית 7א - יאן שינדלמן", sub: "רובע ח׳ · אשדוד", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "YcGsq9ppCTT", hero: "/portfolio/kalanit-7a/cover.jpg", gallery: ["/portfolio/kalanit-7a/01.jpg", "/portfolio/kalanit-7a/02.jpg", "/portfolio/kalanit-7a/03.jpg", "/portfolio/kalanit-7a/04.jpg", "/portfolio/kalanit-7a/05.jpg", "/portfolio/kalanit-7a/06.jpg", "/portfolio/kalanit-7a/07.jpg", "/portfolio/kalanit-7a/08.jpg", "/portfolio/kalanit-7a/09.jpg", "/portfolio/kalanit-7a/10.jpg", "/portfolio/kalanit-7a/11.jpg", "/portfolio/kalanit-7a/12.jpg", "/portfolio/kalanit-7a/13.jpg", "/portfolio/kalanit-7a/14.jpg", "/portfolio/kalanit-7a/15.jpg", "/portfolio/kalanit-7a/16.jpg", "/portfolio/kalanit-7a/17.jpg", "/portfolio/kalanit-7a/18.jpg", "/portfolio/kalanit-7a/19.jpg"], tags: ["מרפסת","סלון","מטבח","סיור וירטואלי 3D"] },
  { id: 21, title: "אוסישקין 21 - יאן שינדלמן", sub: "רובע ט״ו · אשדוד", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "x8CmoHwwyA1", hero: "/portfolio/ussishkin-21/cover.jpg", gallery: ["/portfolio/ussishkin-21/01.jpg", "/portfolio/ussishkin-21/02.jpg", "/portfolio/ussishkin-21/03.jpg", "/portfolio/ussishkin-21/04.jpg", "/portfolio/ussishkin-21/05.jpg", "/portfolio/ussishkin-21/06.jpg", "/portfolio/ussishkin-21/07.jpg", "/portfolio/ussishkin-21/08.jpg", "/portfolio/ussishkin-21/09.jpg", "/portfolio/ussishkin-21/10.jpg", "/portfolio/ussishkin-21/11.jpg", "/portfolio/ussishkin-21/12.jpg"], tags: ["מרפסת","סלון","מטבח","סיור וירטואלי 3D"] },
  { id: 22, title: "פתח תקווה 9 - יאן שינדלמן", sub: "רובע ט׳ · אשדוד", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "FkkW9mVhJC4", hero: "/portfolio/petah-tikva-9/cover.jpg", gallery: ["/portfolio/petah-tikva-9/01.jpg", "/portfolio/petah-tikva-9/02.jpg", "/portfolio/petah-tikva-9/03.jpg", "/portfolio/petah-tikva-9/04.jpg", "/portfolio/petah-tikva-9/05.jpg", "/portfolio/petah-tikva-9/06.jpg", "/portfolio/petah-tikva-9/07.jpg", "/portfolio/petah-tikva-9/08.jpg", "/portfolio/petah-tikva-9/09.jpg", "/portfolio/petah-tikva-9/10.jpg", "/portfolio/petah-tikva-9/11.jpg", "/portfolio/petah-tikva-9/12.jpg", "/portfolio/petah-tikva-9/13.jpg", "/portfolio/petah-tikva-9/14.jpg", "/portfolio/petah-tikva-9/15.jpg", "/portfolio/petah-tikva-9/16.jpg", "/portfolio/petah-tikva-9/17.jpg"], tags: ["מרפסת גג","סלון","מטבח","סיור וירטואלי 3D"] },
  { id: 23, title: "שי עגנון 21 - יאן שינדלמן", sub: "עתיקות · אשקלון", city: "אשקלון", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "JN6a8HHqRpX", hero: "/portfolio/agnon-21/cover.jpg", gallery: ["/portfolio/agnon-21/01.jpg", "/portfolio/agnon-21/02.jpg", "/portfolio/agnon-21/03.jpg", "/portfolio/agnon-21/04.jpg", "/portfolio/agnon-21/05.jpg", "/portfolio/agnon-21/06.jpg", "/portfolio/agnon-21/07.jpg", "/portfolio/agnon-21/08.jpg", "/portfolio/agnon-21/09.jpg", "/portfolio/agnon-21/10.jpg", "/portfolio/agnon-21/11.jpg"], tags: ["סלון","מטבח","סיור וירטואלי 3D"] },
  { id: 24, title: "נחל שניר 9 - יאן שינדלמן", sub: "רובע י״א · אשדוד", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "mDADwNnNKtD", hero: "/portfolio/nahal-snir-9/cover.jpg", gallery: ["/portfolio/nahal-snir-9/01.jpg", "/portfolio/nahal-snir-9/02.jpg", "/portfolio/nahal-snir-9/03.jpg", "/portfolio/nahal-snir-9/04.jpg", "/portfolio/nahal-snir-9/05.jpg", "/portfolio/nahal-snir-9/06.jpg", "/portfolio/nahal-snir-9/07.jpg", "/portfolio/nahal-snir-9/08.jpg", "/portfolio/nahal-snir-9/09.jpg", "/portfolio/nahal-snir-9/10.jpg", "/portfolio/nahal-snir-9/11.jpg", "/portfolio/nahal-snir-9/12.jpg", "/portfolio/nahal-snir-9/13.jpg"], tags: ["סלון","מטבח","מרפסת","סיור וירטואלי 3D"] },
  { id: 25, title: "מיכה הנביא 13 - יאן שינדלמן", sub: "רובע י׳ · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/micha-hanavi-13/cover.jpg", gallery: ["/portfolio/micha-hanavi-13/01.jpg", "/portfolio/micha-hanavi-13/02.jpg", "/portfolio/micha-hanavi-13/03.jpg", "/portfolio/micha-hanavi-13/04.jpg", "/portfolio/micha-hanavi-13/05.jpg", "/portfolio/micha-hanavi-13/06.jpg", "/portfolio/micha-hanavi-13/07.jpg", "/portfolio/micha-hanavi-13/08.jpg", "/portfolio/micha-hanavi-13/09.jpg", "/portfolio/micha-hanavi-13/10.jpg", "/portfolio/micha-hanavi-13/11.jpg", "/portfolio/micha-hanavi-13/12.jpg", "/portfolio/micha-hanavi-13/13.jpg", "/portfolio/micha-hanavi-13/14.jpg"], tags: ["סלון","מטבח"] },
  { id: 26, title: "הרב קוק 19 - יאן שינדלמן", sub: "רובע ב׳ · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/harav-kook-19/cover.jpg", gallery: ["/portfolio/harav-kook-19/01.jpg", "/portfolio/harav-kook-19/02.jpg", "/portfolio/harav-kook-19/03.jpg", "/portfolio/harav-kook-19/04.jpg", "/portfolio/harav-kook-19/05.jpg", "/portfolio/harav-kook-19/06.jpg", "/portfolio/harav-kook-19/07.jpg", "/portfolio/harav-kook-19/08.jpg", "/portfolio/harav-kook-19/09.jpg", "/portfolio/harav-kook-19/10.jpg", "/portfolio/harav-kook-19/11.jpg", "/portfolio/harav-kook-19/12.jpg", "/portfolio/harav-kook-19/13.jpg", "/portfolio/harav-kook-19/14.jpg", "/portfolio/harav-kook-19/15.jpg", "/portfolio/harav-kook-19/16.jpg"], tags: ["סלון","מטבח"] },
  { id: 27, title: "האשכול 8 - יאן שינדלמן", sub: "רובע א׳ · אשדוד", city: "אשדוד", tag: "דירה + סיור וירטואלי", partner: "ReHouse", company: "rehouse", matterport: "mWxuq2zaKdZ", hero: "/portfolio/haeshkol-8/cover.jpg", gallery: ["/portfolio/haeshkol-8/01.jpg", "/portfolio/haeshkol-8/02.jpg", "/portfolio/haeshkol-8/03.jpg", "/portfolio/haeshkol-8/04.jpg", "/portfolio/haeshkol-8/05.jpg", "/portfolio/haeshkol-8/06.jpg", "/portfolio/haeshkol-8/07.jpg", "/portfolio/haeshkol-8/08.jpg", "/portfolio/haeshkol-8/09.jpg", "/portfolio/haeshkol-8/10.jpg", "/portfolio/haeshkol-8/11.jpg", "/portfolio/haeshkol-8/12.jpg", "/portfolio/haeshkol-8/13.jpg", "/portfolio/haeshkol-8/14.jpg", "/portfolio/haeshkol-8/15.jpg", "/portfolio/haeshkol-8/16.jpg"], tags: ["נוף","מטבח","סלון","סיור וירטואלי 3D"] },
  { id: 28, title: "מילמן 2 - יאן שינדלמן", sub: "רובע ו׳ · אשדוד", city: "אשדוד", tag: "דירה", partner: "ReHouse", company: "rehouse", hero: "/portfolio/milman-2/cover.jpg", gallery: ["/portfolio/milman-2/01.jpg", "/portfolio/milman-2/02.jpg", "/portfolio/milman-2/03.jpg", "/portfolio/milman-2/04.jpg", "/portfolio/milman-2/05.jpg", "/portfolio/milman-2/06.jpg", "/portfolio/milman-2/07.jpg", "/portfolio/milman-2/08.jpg", "/portfolio/milman-2/09.jpg", "/portfolio/milman-2/10.jpg", "/portfolio/milman-2/11.jpg", "/portfolio/milman-2/12.jpg", "/portfolio/milman-2/13.jpg", "/portfolio/milman-2/14.jpg", "/portfolio/milman-2/15.jpg", "/portfolio/milman-2/16.jpg", "/portfolio/milman-2/17.jpg", "/portfolio/milman-2/18.jpg", "/portfolio/milman-2/19.jpg"], tags: ["סלון","מטבח","מרפסת"] },
];

const COVER_ID = 8;

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
  { id: "remax", name: "RE/MAX", sub: "ישראל", desc: "" },
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
    note: "הסיור כרוך במנוי חודשי של ₪40 + מע״מ" },
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
  const [lead, ...side] = PORTFOLIO.filter(p => PROPERTY_IMAGES[p.id] && p.id !== COVER_ID);

  return (
    <>
      {/* Cover */}
      <div className="visio-cover-wrap">
        <section className="visio-cover">
          <Image src={PROPERTY_IMAGES[COVER_ID].hero} alt={PORTFOLIO.find(p => p.id === COVER_ID).title} width={1920} height={1080} sizes="100vw" priority />
          <div className="visio-cover-shade" />
          <div className="visio-cover-text">
            <div className="visio-kicker"><Bidi>VISIO PHOTOGRAPHY</Bidi></div>
            <h1 className="visio-cover-title">נדל״ן. בצילום שמוכר.</h1>
            <p className="visio-cover-sub"><Bidi>צילום נדל״ן מקצועי · AI Editing · סיורים וירטואליים · אספקה עד 48 שעות</Bidi></p>
            <div className="visio-cover-btns">
              <button className="visio-btn on-image" onClick={() => onNav("booking")}>הזמן צילום עכשיו</button>
              <button className="visio-btn on-image outline" onClick={() => onNav("portfolio")}>צפה בעבודות</button>
            </div>
          </div>
        </section>
      </div>

      {/* Latest work */}
      <section className="visio-section">
        <div className="visio-rule-head visio-wrap"><span className="visio-kicker">עבודות אחרונות</span></div>
        <div className="visio-feature-grid">
          <button className="visio-story" onClick={() => onNav("portfolio")}>
            <StoryImage id={lead.id} title={lead.title} />
            {lead.tag && <div className="visio-kicker" style={{ marginTop: 18 }}>{lead.tag}</div>}
            <h2 className="visio-story-title lead">{lead.title}</h2>
            <p className="visio-story-dek">{lead.sub}</p>
            <div className="visio-credit"><Bidi>צילום: VISIO</Bidi></div>
          </button>
          <div className="visio-story-list">
            {side.slice(0, 4).map(p => (
              <button key={p.id} className="visio-story" onClick={() => onNav("portfolio")}>
                <div>
                  {p.tag && <div className="visio-kicker">{p.tag}</div>}
                  <h2 className="visio-story-title">{p.title}</h2>
                  <div className="visio-credit"><Bidi>צילום: VISIO</Bidi></div>
                </div>
                <StoryImage id={p.id} title={p.title} />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <div style={{ padding: "0 20px" }}>
        <div className="visio-stats">
          {[["500+","נכסים צולמו"],["48H","זמן אספקה מרבי"],["100%","לקוחות מרוצים"],["12+12","תמונות ממותגות בחבילה"]].map(([n,l]) => (
            <div key={l} className="visio-stat">
              <div className="visio-stat-num"><Bidi>{n}</Bidi></div>
              <div className="visio-kicker muted">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Partners */}
      <section className="visio-section" style={{ textAlign: "center" }}>
        <div className="visio-kicker muted" style={{ marginBottom: 28 }}>שותפים עסקיים</div>
        <div className="visio-partners">
          {PARTNERS.map(p => (
            <div key={p.id}>
              <div className="visio-partner-name"><Bidi>{p.name}</Bidi></div>
              <div className="visio-credit" style={{ marginTop: 4 }}><Bidi>{p.sub}</Bidi></div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="visio-section visio-wrap" style={{ textAlign: "center", borderTop: `1px solid ${C.rule}` }}>
        <h2 className="visio-section-title">מוכן לשדרג את הנכס שלך?</h2>
        <p className="visio-section-sub" style={{ marginBottom: 28 }}>קבל הצעת מחיר תוך 24 שעות · ללא התחייבות</p>
        <button className="visio-btn" onClick={() => onNav("booking")}>צרו קשר</button>
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
  const closeRef = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => { if (opener && typeof opener.focus === "function") opener.focus(); };
  }, []);
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
    <div className="visio-lightbox" role="dialog" aria-modal="true" aria-label="גלריית תמונות" onClick={onClose} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <img src={imgs[idx]} alt="" decoding="async" onClick={e => e.stopPropagation()} draggable={false} />
      <div className="visio-lightbox-controls" onClick={e => e.stopPropagation()}>
        {imgs.length > 1 && (
          <>
            <button className="visio-icon-btn" onClick={() => onStep(-1)} aria-label="הקודם">‹</button>
            <span className="visio-credit" dir="ltr">{idx + 1} / {imgs.length}</span>
            <button className="visio-icon-btn" onClick={() => onStep(1)} aria-label="הבא">›</button>
          </>
        )}
        <button ref={closeRef} className="visio-icon-btn" onClick={onClose} aria-label="סגור" style={{ fontSize: 12, letterSpacing: ".2em" }}><span aria-hidden="true">✕</span> סגור</button>
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
  const shown = company === "all" ? PORTFOLIO : PORTFOLIO.filter(p => companyOf(p) === company);

  const openGallery = (gallery) => { setLightboxImgs(gallery); setLightboxIdx(0); };
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
          {hero ? <Image src={hero} alt={p.title} width={1600} height={1200} sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw" /> : <div className="visio-placeholder"><Bidi>VISIO</Bidi></div>}
          {gallery.length > 1 && <div className="visio-img-label left">⊞ {gallery.length}</div>}

          {active === p.id && (tourHref || gallery.length > 0) && (
            <div className="visio-portfolio-hover" onClick={e => e.stopPropagation()}>
              {tourHref && (
                <a
                  className="visio-btn on-image"
                  href={tourHref}
                  style={{ textDecoration: "none" }}
                  {...(p.tour ? {} : { target: "_blank", rel: "noreferrer" })}
                >
                  ▶ סיור וירטואלי 3D
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

        <div className="visio-portfolio-meta">
          {p.tag && <div className="visio-kicker">{p.tag}</div>}
          <h2 className="visio-story-title">{p.title}</h2>
          <p className="visio-story-dek" style={{ fontSize: 15 }}>{p.sub}</p>
          <div className="visio-credit">
            <Bidi>{cardTagLine(p)}</Bidi>
          </div>
          {/* Keyboard / screen-reader access to the hover-only actions (visible only on focus) */}
          {tourHref && (
            <a className="visio-sr-only-focusable" href={tourHref} {...(p.tour ? {} : { target: "_blank", rel: "noreferrer" })}>
              סיור וירטואלי 3D — {p.title}
            </a>
          )}
          {gallery.length > 0 && (
            <button type="button" className="visio-sr-only-focusable" onClick={() => openGallery(gallery)}>
              גלריית תמונות ({gallery.length}) — {p.title}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className="visio-section">
      <SectionTitle sup="PORTFOLIO" title="עבודות נבחרות" sub="נכסי יוקרה · אשדוד · אשקלון · יבנה" />
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
              <div className="visio-portfolio-grid" key={`${company}-${city}`}>
                {items.map(renderCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="visio-portfolio-grid" key={company}>
          {shown.map(renderCard)}
        </div>
      )}
    </section>
  );
}

/* ─── PRICING ─── */
function PricingSection({ onNav }) {
  const [showVat, setShowVat] = useState(false);
  const p = (base) => fmtMoney(showVat ? base * (1 + VAT) : base);

  return (
    <section className="visio-section">
      <SectionTitle sup="PRICING" title="חבילות ומחירים" sub="מחירים שקופים · ללא הפתעות" />

      {/* VAT toggle */}
      <div className="visio-switch">
        <span className="visio-credit" style={{ color: showVat ? C.muted : C.ink }}>ללא מע״מ</span>
        <button type="button" className="visio-switch-track" onClick={() => setShowVat(v => !v)} aria-pressed={showVat} aria-label="הצג מחירים כולל מע״מ">
          <span style={{ left: showVat ? 23 : 3 }} />
        </button>
        <span className="visio-credit" style={{ color: showVat ? C.ink : C.muted }}>כולל מע״מ (18%)</span>
      </div>

      {/* Cards */}
      <div className="visio-pricing-grid">
        {PACKAGES.map(pkg => (
          <div key={pkg.id} className={`visio-price-card metal-${pkg.tier}${pkg.recommended ? " featured" : ""}`}>
            {pkg.recommended && <div className="visio-badge">מומלץ</div>}
            <img className={`visio-pkg-logo metal-${pkg.tier}`} src={`/packages/visio-${pkg.tier}.svg`} alt={pkg.name} width="96" height="96" loading="lazy" />
            <div className="visio-price-name visio-price-name-en" dir="ltr">{pkg.name}</div>
            <div className="visio-price">₪{p(pkg.price)}</div>
            <div className="visio-credit" style={{ marginTop: 10 }}>{pkg.unit ? `${pkg.unit} · ` : ""}{showVat ? "כולל מע״מ (18%)" : "+ מע״מ (18%)"}</div>
            <p className="visio-price-desc" dir="rtl"><Bidi numbers>{pkg.desc}</Bidi></p>
            {pkg.note && <p className="visio-price-note" dir="rtl"><Bidi numbers>{`* ${pkg.note}`}</Bidi></p>}
            <button className={`visio-btn block${pkg.recommended ? "" : " outline"}`} onClick={() => onNav("booking")} style={{ letterSpacing: ".1em" }}>
              הזמן עכשיו ← תשלום בעת ההזמנה
            </button>
          </div>
        ))}
      </div>
      <p className="visio-gear-line" dir="rtl">כל המחירים אינם כוללים מע״מ — <bdi dir="ltr">18%</bdi> מע״מ יתווספו לחשבון (לדוגמה: <bdi dir="ltr">₪450 + 18% = ₪{fmtMoney(450 * (1 + VAT))}</bdi>). גם מנוי הסיור הווירטואלי (<Money n={40} /> לחודש) הוא בתוספת מע״מ. התשלום מתבצע בעת ההזמנה.</p>
      <p className="visio-gear-line" dir="rtl"><Bidi>{GEAR_LINE}</Bidi></p>
    </section>
  );
}

/* ─── BOOKING ─── */
const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const HEB_DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const HEB_DOW_SHORT = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];
const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];
const TERMS_URL = "/?page=charter";
const PRIVACY_URL = "/privacy";

/* Asia/Jerusalem "now" helpers (the business calendar runs on Israel time). */
const ilToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
const ilNowHHMM = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

function Field({ id, label, required, error, hint, children }) {
  return (
    <div>
      <label className="visio-label" htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {children}
      {hint && <div id={`${id}-hint`} className="visio-field-hint">{hint}</div>}
      {error && <div id={`${id}-error`} className="visio-field-error" role="alert">{error}</div>}
    </div>
  );
}

function BookingSection() {
  const today = new Date();
  const [yr, setYr] = useState(today.getFullYear());
  const [mo, setMo] = useState(today.getMonth());
  const [selDate, setSelDate] = useState(null);
  const [selSlot, setSelSlot] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", pkg: "FULL", notes: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [wm, setWm] = useState({ agentPhone: "", logoFile: null, logoUrl: null, agentPhotoFile: null, agentPhotoUrl: null, wantAgentPhoto: false });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const logoRef = useRef(null);
  const photoRef = useRef(null);
  const slotsRef = useRef(null);
  const formRef = useRef(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  const handleFile = (field, urlField, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!UPLOAD_TYPES.includes(file.type)) { setErrors(er => ({ ...er, [field]: "ניתן להעלות JPG, PNG או WebP בלבד" })); e.target.value = ""; return; }
    if (file.size > UPLOAD_MAX_BYTES) { setErrors(er => ({ ...er, [field]: "גודל הקובץ המרבי הוא 2MB" })); e.target.value = ""; return; }
    setErrors(er => ({ ...er, [field]: undefined }));
    const reader = new FileReader();
    reader.onload = ev => setWm(w => ({ ...w, [field]: file, [urlField]: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const getDIM = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirst = (y, m) => new Date(y, m, 1).getDay();
  const toKey = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const isWknd = (y, m, d) => { const w = new Date(y, m, d).getDay(); return w === 5 || w === 6; };
  const isPast = (y, m, d) => toKey(y, m, d) < ilToday();
  const getHebDate = (y, m, d) => { try { return new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { day: "numeric" }).format(new Date(y, m, d)); } catch { return ""; } };
  const slotPast = (sl) => selDate === ilToday() && sl <= ilNowHHMM();

  const dim = getDIM(yr, mo), first = getFirst(yr, mo);
  const [sy, sm, sd] = selDate ? selDate.split("-").map(Number) : [];

  const clientValidate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = "יש להזין שם מלא";
    if (!/^0\d{8,9}$/.test(form.phone.replace(/[\s\-().]/g, "").replace(/^\+?972/, "0"))) e.phone = "יש להזין מספר טלפון תקין";
    if (!/^[^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,}$/.test(form.email.trim())) e.email = "יש להזין כתובת אימייל תקינה";
    if (form.address.trim().length < 3) e.address = "יש להזין את כתובת הנכס";
    if (!consent) e.consentTerms = "יש לאשר את תנאי השירות ומדיניות הפרטיות";
    return e;
  };

  const completeBooking = async () => {
    setBookingLoading(true);
    setSubmitError("");
    const fd = new FormData();
    Object.entries({ ...form, date: selDate, time: selSlot, agentPhone: wm.agentPhone, wantAgentPhoto: String(wm.wantAgentPhoto), consentTerms: String(consent), termsVersion: TERMS_VERSION }).forEach(([k, v]) => fd.append(k, v ?? ""));
    if (wm.logoFile) fd.append("logo", wm.logoFile);
    if (wm.wantAgentPhoto && wm.agentPhotoFile) fd.append("agentPhoto", wm.agentPhotoFile);
    try {
      const res = await fetch("/api/book-appointment", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setDone(true);
      } else {
        if (json.fields) setErrors(json.fields);
        setSubmitError(json.error || "לא הצלחנו לקלוט את ההזמנה. נסו שוב או פנו אלינו ב-WhatsApp.");
      }
    } catch {
      setSubmitError("אין חיבור לשרת. נסו שוב או פנו אלינו ב-WhatsApp.");
    }
    setBookingLoading(false);
  };

  const handleSubmitBooking = (e) => {
    e?.preventDefault();
    if (!selDate || !selSlot) { setSubmitError("יש לבחור תאריך ושעה"); return; }
    const e2 = clientValidate();
    setErrors(e2);
    if (Object.keys(e2).length) {
      setSubmitError("יש לתקן את השדות המסומנים");
      const firstKey = ["name", "phone", "email", "address", "consentTerms"].find(k => e2[k]);
      formRef.current?.querySelector(`#bk-${firstKey}`)?.focus();
      return;
    }
    completeBooking();
  };

  const pkgObj = PACKAGES.find(x => x.id === form.pkg);
  const errProps = (k) => errors[k] ? { "aria-invalid": true, "aria-describedby": `bk-${k}-error` } : {};

  if (done) return (
    <section className="visio-section" style={{ textAlign: "center" }} aria-live="polite">
      <div className="visio-kicker"><Bidi>VISIO</Bidi></div>
      <h1 className="visio-section-title">בקשת ההזמנה התקבלה ✓</h1>
      <p style={{ fontSize: 16, color: C.muted, margin: 0 }}>ניצור איתך קשר לאישור המועד. ההזמנה נכנסת לתוקף לאחר אישור המועד. {form.email && <>אישור נשלח גם לכתובת <bdi dir="ltr">{form.email}</bdi>.</>}</p>
      <p className="visio-notice" style={{ maxWidth: 460, margin: "20px auto 0", fontSize: 15 }}>
        התשלום מתבצע בעת ההזמנה. המחירים אינם כוללים מע״מ (18% יתווספו לחשבון).
      </p>
      {/* PAYMENT STEP PLACEHOLDER — online payment is NOT implemented.
          Planned: redirect to the acquirer's hosted payment page (card / Apple Pay / Google Pay),
          see docs/payments-architecture.md. No provider keys exist in this codebase. */}
      <div className="visio-done-grid">
        {[["תאריך", `${sd} ${HEB_MONTHS[sm - 1]} ${sy}`], ["שעה", selSlot], ["חבילה", pkgObj?.name || form.pkg], ["כתובת", form.address]].map(([l, v]) => (
          <div key={l}>
            <div className="visio-kicker muted" style={{ marginBottom: 6 }}>{l}</div>
            <div className="visio-serif" style={{ fontSize: 18, color: C.ink }}><Bidi>{v}</Bidi></div>
          </div>
        ))}
      </div>
      <button className="visio-btn outline" style={{ marginTop: 28 }} onClick={() => { setDone(false); setStep(1); setSelDate(null); setSelSlot(null); setConsent(false); }}>
        ← קביעת צילום נוסף
      </button>
    </section>
  );

  return (
    <div className="visio-booking-wrap">
      <SectionTitle as="h1" sup="BOOKING" title="תיאום מועד צילום" sub="בחרו תאריך ושעה · נאשר את המועד מולכם" />

      {/* Steps */}
      <ol className="visio-steps" aria-label="שלבי ההזמנה">
        {["תאריך", "שעה", "פרטים"].map((s, i) => (
          <li key={s} style={{ display: "flex", alignItems: "center", flex: i < 2 ? "1" : undefined }} aria-current={step === i + 1 ? "step" : undefined}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div className={`visio-step-dot${step > i + 1 ? " done" : step === i + 1 ? " current" : ""}`} aria-hidden="true">
                {step > i + 1 ? "✓" : i + 1}
              </div>
              <div className="visio-credit" style={{ color: step === i + 1 ? C.ink : C.muted }}>{s}</div>
            </div>
            {i < 2 && <div aria-hidden="true" style={{ flex: 1, height: 1, background: C.rule, margin: "0 8px 22px" }} />}
          </li>
        ))}
      </ol>

      {/* Calendar */}
      <div className="visio-panel" role="group" aria-labelledby="bk-cal-title">
        <div className="visio-panel-head">
          <button type="button" className="visio-icon-btn" aria-label="החודש הקודם" onClick={() => { if (mo === 0) { setYr(y => y - 1); setMo(11); } else setMo(m => m - 1); }}>›</button>
          <h2 id="bk-cal-title" className="visio-panel-title" aria-live="polite">{HEB_MONTHS[mo]} {yr}</h2>
          <button type="button" className="visio-icon-btn" aria-label="החודש הבא" onClick={() => { if (mo === 11) { setYr(y => y + 1); setMo(0); } else setMo(m => m + 1); }}>‹</button>
        </div>
        <div className="visio-cal-dow" aria-hidden="true">
          {HEB_DOW_SHORT.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="visio-cal-grid">
          {Array(first).fill(null).map((_, i) => <div key={`e${i}`} className="visio-calendar-day" aria-hidden="true" />)}
          {Array(dim).fill(null).map((_, i) => {
            const day = i + 1, key = toKey(yr, mo, day);
            const avail = !isWknd(yr, mo, day) && !isPast(yr, mo, day), sel = selDate === key;
            const isT = key === ilToday();
            const cls = ["visio-calendar-day", avail ? "available" : "blocked", isT && "today", sel && "selected"].filter(Boolean).join(" ");
            const dow = HEB_DAYS[new Date(yr, mo, day).getDay()];
            return (
              <button type="button" key={day} className={cls} disabled={!avail} aria-pressed={sel}
                aria-label={`יום ${dow}, ${day} ב${HEB_MONTHS[mo]} ${yr}${avail ? "" : " — לא זמין"}`}
                onClick={() => { setSelDate(key); setSelSlot(null); setStep(2); setTimeout(() => slotsRef.current?.querySelector("button:not([disabled])")?.focus(), 0); }}>
                <span className="num">{day}</span>
                <span className="heb" aria-hidden="true">{getHebDate(yr, mo, day)}</span>
              </button>
            );
          })}
        </div>
        <div className="visio-panel-foot">
          שישי-שבת אינם זמינים · המועד ייקבע סופית לאחר אישור שלנו
        </div>
      </div>

      {/* Time slots */}
      {step >= 2 && (
        <div className="visio-panel" role="group" aria-labelledby="bk-slot-title">
          <div className="visio-panel-head">
            <h2 id="bk-slot-title" className="visio-panel-title">בחרו שעה</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button type="button" className="visio-link" style={{ fontSize: 13 }} onClick={() => { setStep(1); setSelDate(null); setSelSlot(null); }}>שינוי תאריך</button>
              <span style={{ fontSize: 13, color: C.ink }}>יום {sd && HEB_DAYS[new Date(sy, sm - 1, sd).getDay()]} · {sd} {sm && HEB_MONTHS[sm - 1]}</span>
            </div>
          </div>
          <div className="visio-time-slots" ref={slotsRef}>
            {SLOTS.map(sl => {
              const past = slotPast(sl);
              return (
                <button type="button" key={sl} disabled={past} aria-pressed={selSlot === sl} className={`visio-time-slot${selSlot === sl ? " selected" : ""}`}
                  onClick={() => { setSelSlot(sl); setStep(3); setTimeout(() => formRef.current?.querySelector("#bk-pkg")?.focus(), 0); }}>
                  {sl}
                  <small>{past ? "עבר" : "פנוי"}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Form */}
      {step >= 3 && (
        <form id="booking-form" className="visio-panel" ref={formRef} onSubmit={handleSubmitBooking} noValidate aria-labelledby="bk-form-title">
          <h2 id="bk-form-title" className="visio-sr-only">פרטי ההזמנה</h2>
          <div className="visio-form-grid-2">
            {[["תאריך", `${sd} ${HEB_MONTHS[sm - 1]} ${sy}`], ["שעה", selSlot]].map(([l, v]) => (
              <div key={l}>
                <div className="visio-kicker muted" style={{ marginBottom: 4 }}>{l}</div>
                <div className="visio-serif" style={{ fontSize: 18, color: C.ink }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="visio-form-body">
            <Field id="bk-pkg" label="חבילה">
              <select id="bk-pkg" name="pkg" className="visio-input" value={form.pkg} onChange={e => setForm(f => ({ ...f, pkg: e.target.value }))}>
                <option value="CONSULTATION">ייעוץ טלפוני — חינם</option>
                <option value="PHOTOS">VISIO Essential — ₪365 + מע״מ</option>
                <option value="PHOTOS_VIDEO">VISIO Motion — ₪400 + מע״מ</option>
                <option value="FULL">VISIO Signature — ₪450 + מע״מ</option>
                <option value="INSTAGRAM">VISIO Social — ₪120 לשעת עבודה + מע״מ</option>
              </select>
            </Field>
            {[
              ["שם מלא", "name", "שם פרטי + משפחה", "rtl", "text", "name"],
              ["טלפון", "phone", "05X-XXXXXXX", "ltr", "tel", "tel"],
              ["אימייל", "email", "name@example.com", "ltr", "email", "email"],
              ["כתובת הנכס", "address", "רחוב, מספר, עיר", "rtl", "text", "street-address"],
            ].map(([lbl, key, ph, dir, type, ac]) => (
              <Field key={key} id={`bk-${key}`} label={lbl} required error={errors[key]} hint={key === "email" ? "לאישור ההזמנה, קבלת הקבצים והחשבונית" : undefined}>
                <input id={`bk-${key}`} name={key} type={type} autoComplete={ac} required aria-required="true" className="visio-input" placeholder={ph} dir={dir}
                  maxLength={key === "address" ? 160 : key === "email" ? 120 : 80} value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} {...errProps(key)} />
              </Field>
            ))}
            <Field id="bk-notes" label="הערות לצלם" error={errors.notes}>
              <textarea id="bk-notes" name="notes" className="visio-input" rows={3} maxLength={1000} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} {...errProps("notes")} />
            </Field>
            {/* Honeypot (hidden from people and assistive tech) */}
            <div className="visio-hp" aria-hidden="true">
              <label htmlFor="bk-website">Website</label>
              <input id="bk-website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
            </div>

            {/* Watermark section */}
            <fieldset style={{ border: `1px solid ${C.rule}`, background: C.bg2, padding: "20px 18px", margin: 0 }}>
              <legend className="visio-panel-title" style={{ padding: "0 6px" }}>בראנדינג על התמונות (אופציונלי)</legend>
              <div style={{ fontSize: 14, color: C.muted, marginBottom: 18 }}>לוגו + טלפון + תמונת סוכן — יופיעו על כל תמונה · JPG / PNG / WebP עד 2MB</div>

              <div style={{ marginBottom: 16 }}>
                <Field id="bk-agentPhone" label="מספר טלפון על התמונה" error={errors.agentPhone}>
                  <input id="bk-agentPhone" name="agentPhone" type="tel" autoComplete="off" className="visio-input" placeholder="05X-XXXXXXX" dir="ltr" maxLength={20} value={wm.agentPhone} onChange={e => setWm(w => ({ ...w, agentPhone: e.target.value }))} {...errProps("agentPhone")} />
                </Field>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="visio-label" htmlFor="bk-logo">לוגו חברה / סוכנות</label>
                <input id="bk-logo" ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" className="visio-sr-only" onChange={e => handleFile("logoFile", "logoUrl", e)} />
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="visio-btn outline" style={{ minHeight: 44, padding: "9px 18px", fontSize: 13 }} onClick={() => logoRef.current?.click()} aria-describedby={errors.logoFile ? "bk-logoFile-error" : undefined}>
                    {wm.logoUrl ? "↺ החלפת לוגו" : "↑ העלאת לוגו"}
                  </button>
                  {wm.logoUrl && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <img src={wm.logoUrl} alt="תצוגה מקדימה של הלוגו" style={{ height: 36, maxWidth: 100, objectFit: "contain", background: C.bg, padding: 4, border: `1px solid ${C.rule}` }} />
                    <span style={{ fontSize: 13, color: C.ink }}>✓ הלוגו צורף</span>
                  </div>}
                </div>
                {errors.logoFile && <div id="bk-logoFile-error" className="visio-field-error" role="alert">{errors.logoFile}</div>}
              </div>

              <div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", marginBottom: 14 }}>
                  <input type="checkbox" className="visio-check" checked={wm.wantAgentPhoto} onChange={e => setWm(w => ({ ...w, wantAgentPhoto: e.target.checked }))} />
                  <span>
                    <span style={{ display: "block", fontSize: 15, color: C.text }}>אני מעוניין/ת שתמונת הסוכן תופיע על התמונות</span>
                    <span style={{ display: "block", fontSize: 13, color: C.muted, marginTop: 3 }}>הסוכן יוצב בפינה על כל תמונה</span>
                  </span>
                </label>

                {wm.wantAgentPhoto && (
                  <div style={{ padding: 16, background: C.bg, border: `1px solid ${C.rule}` }}>
                    <label className="visio-label" htmlFor="bk-agentPhoto">תמונת גוף של הסוכן</label>
                    <input id="bk-agentPhoto" ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="visio-sr-only" onChange={e => handleFile("agentPhotoFile", "agentPhotoUrl", e)} />
                    <button type="button" className="visio-btn outline" style={{ minHeight: 44, padding: "9px 18px", fontSize: 13 }} onClick={() => photoRef.current?.click()}>
                      {wm.agentPhotoUrl ? "↺ החלפת תמונה" : "↑ העלאת תמונת גוף"}
                    </button>
                    {errors.agentPhotoFile && <div className="visio-field-error" role="alert">{errors.agentPhotoFile}</div>}
                    {wm.agentPhotoUrl && (
                      <div style={{ marginTop: 12, position: "relative", height: 140, background: "#1a1a1a", overflow: "hidden" }}>
                        {wm.logoUrl && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.6)", padding: "3px 6px" }}>
                          <img src={wm.logoUrl} alt="" style={{ height: 22, maxWidth: 72, objectFit: "contain", display: "block" }} />
                        </div>}
                        {wm.agentPhone && <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.7)", padding: "3px 10px", fontSize: 12, color: "#fff", letterSpacing: 1.5 }}>📞 {wm.agentPhone}</div>}
                        <img src={wm.agentPhotoUrl} alt="תצוגה מקדימה של תמונת הסוכן" style={{ position: "absolute", bottom: 0, left: 8, height: "85%", objectFit: "contain", objectPosition: "bottom" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </fieldset>

            {/* Order summary shown before confirmation (terms 2.2, 3.1, 5.1, 6.1, 9) */}
            <div className="visio-order-summary" aria-labelledby="bk-sum-title">
              <h3 id="bk-sum-title" className="visio-term-title" style={{ fontSize: 18, marginBottom: 8 }}>לפני אישור ההזמנה</h3>
              <ul>
                <li>{pkgObj ? <><Bidi>{pkgObj.name}</Bidi>: <Money n={pkgObj.price} />{pkgObj.unit ? ` ${pkgObj.unit}` : ""} + מע״מ (<bdi dir="ltr">18%</bdi>). סה״כ לתשלום: <Money n={pkgObj.price * (1 + VAT)} />{pkgObj.unit ? ` ${pkgObj.unit}` : ""}.</> : "ייעוץ טלפוני — ללא עלות"}</li>
                {form.pkg === "FULL" && <li><strong>סיור וירטואלי:</strong> מנוי חודשי של <Money n={40} /> + מע״מ (<Money n={40 * (1 + VAT)} /> לחודש), מתחדש אוטומטית וניתן לביטול בהתאם לתנאי השירות.</li>}
                <li>התשלום מתבצע בעת ההזמנה. ההזמנה נכנסת לתוקף לאחר שנאשר את המועד.</li>
                <li>ביטול: 48 שעות ומעלה לפני הצילום — החזר מלא · <bdi dir="ltr">24–48</bdi> שעות — <bdi dir="ltr">50%</bdi> · פחות מ-24 שעות — ללא החזר.</li>
                <li>אספקת הקבצים: עד 48 שעות מהצילום (הערכה).</li>
              </ul>
            </div>

            {/* Consent (required) */}
            <div>
              <label className="visio-consent" htmlFor="bk-consentTerms">
                <input id="bk-consentTerms" type="checkbox" className="visio-check" checked={consent} onChange={e => { setConsent(e.target.checked); if (e.target.checked) setErrors(er => ({ ...er, consentTerms: undefined })); }} required aria-required="true" {...errProps("consentTerms")} />
                <span>קראתי ואני מסכים/ה ל<a href={TERMS_URL} target="_blank" rel="noopener">תנאי השירות</a> ול<a href={PRIVACY_URL} target="_blank" rel="noopener">מדיניות הפרטיות</a> <span aria-hidden="true">*</span></span>
              </label>
              {errors.consentTerms && <div id="bk-consentTerms-error" className="visio-field-error" role="alert">{errors.consentTerms}</div>}
            </div>

            <div aria-live="assertive">{submitError && <div className="visio-notice visio-notice-error" role="alert">{submitError} <a href="https://wa.me/972533523379" target="_blank" rel="noopener" style={{ color: "inherit", textDecoration: "underline" }}>WhatsApp: <bdi dir="ltr">053-352-3379</bdi></a></div>}</div>
            <button type="submit" className="visio-btn block" disabled={bookingLoading || !consent} aria-disabled={bookingLoading || !consent}
              style={{ cursor: bookingLoading ? "wait" : "pointer" }}>
              {bookingLoading ? "שולח..." : "שליחת בקשת הזמנה"}
            </button>
            {!consent && <div className="visio-field-hint" style={{ textAlign: "center" }}>יש לסמן את תיבת ההסכמה לתנאי השירות כדי לשלוח</div>}
          </div>
        </form>
      )}
    </div>
  );
}

/* ─── CHARTER ─── */
function CharterSection() {
  const publicTerms = [
    { title: "ביטול", body: "ביטול 48 שעות ומעלה — החזר מלא. ביטול 24-48 שעות — 50%. פחות מ-24 שעות — ללא החזר." },
    { title: "אספקה", body: "כל הצילומים יסופקו ב-Google Drive תוך 24-48 שעות מהצילום." },
    { title: "שימוש", body: "הלקוח רשאי להשתמש בתמונות לצרכי שיווק הנכס בלבד." },
    { title: "פרטיות", body: "VISIO שומרת את הזכות לפרסם עבודות לצרכי תיק עבודות, אלא אם התבקשה אחרת." },
    { title: "סיור וירטואלי", body: "סיור וירטואלי מסופק כשירות חוזר חודשי (₪40 לחודש). ניתן לבטל בכל עת עם הודעה מוקדמת." },
    { title: "אחריות", body: "VISIO אחראית לאיכות הצילום ולעמידה בלוחות הזמנים שסוכמו. שינויים לאחר הגשה ייגבו תוספת." },
    { title: "קניין רוחני", body: "כל זכויות היוצרים על התמונות והסרטונים שייכות ל-VISIO. הלקוח מקבל רישיון שימוש בלתי בלעדי." },
  ];

  return (
    <section className="visio-section">
      <SectionTitle sup="CHARTER" title="תנאי שירות" sub="שקיפות מלאה · תנאים ברורים" />
      <div className="visio-narrow">
        {publicTerms.map(t => (
          <div key={t.title} className="visio-term">
            <div className="visio-term-title">{t.title}</div>
            <p><Bidi numbers>{t.body}</Bidi></p>
          </div>
        ))}
        <p style={{ marginTop: 32, textAlign: "center", fontSize: 13, color: C.muted }}>
          לשאלות ובירורים: <a href="mailto:yoni@visioisrael.com" lang="en" dir="ltr" style={{ color: C.ink, unicodeBidi: "isolate" }}>yoni@visioisrael.com</a>
        </p>
      </div>
    </section>
  );
}

/* ─── ABOUT ─── */
function AboutSection({ onNav }) {
  return (
    <section className="visio-section">
      <SectionTitle sup="ABOUT" title="על VISIO" sub="צילום נדל״ן שמוכר" />

      <div className="visio-narrow visio-article">
        <div className="visio-kicker" style={{ marginBottom: 16 }}>החזון שלנו</div>
        <p>
          בנינו את <span lang="en" dir="ltr">VISIO</span> לסוכנים שעובדים מהר. מזמינים בהודעה אחת, מתאמים מועד שנוח לכם ולבעלי הנכס, ומקבלים תמונות מוכנות לפרסום תוך 48 שעות לכל היותר. צילום מקצועי, עיבוד מדויק, ונכס שמושך יותר פניות.
        </p>

        <blockquote className="visio-pullquote">נדל״ן. בצילום שמוכר.</blockquote>

        <div className="visio-about-grid">
          {[["מהירות", "אספקה עד 48 שעות מהצילום לתיקיית Drive"], ["דיוק", "כל תמונה מעובדת ידנית בנוסף ל-AI"], ["טכנולוגיה", "מצלמת Insta360 X4 · רחפן DJI · סיור וירטואלי 3D"], ["שותפות", "עובדים עם סוכנויות המובילות בדרום"]].map(([title, desc], i) => (
            <div key={title}>
              <div className="visio-about-num">{String(i + 1).padStart(2, "0")}</div>
              <div className="visio-term-title" style={{ marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 14, color: C.muted }}><Bidi>{desc}</Bidi></div>
            </div>
          ))}
        </div>

        <div className="visio-rule-head"><span className="visio-kicker">שותפים עסקיים</span></div>
        <div className="visio-partners" style={{ marginBottom: 48 }}>
          {PARTNERS.map(p => (
            <div key={p.id} style={{ textAlign: "center" }}>
              <div className="visio-partner-name"><Bidi>{p.name}</Bidi></div>
              {p.desc && <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}><Bidi>{p.desc}</Bidi></div>}
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center" }}>
          <button className="visio-btn" onClick={() => onNav("booking")}>צרו קשר עכשיו</button>
        </div>
      </div>
    </section>
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
  { id: "charter", label: "תקנון" },
  { id: "about", label: "אודות" },
];

/* ═══════════════════════════════════
   APP
═══════════════════════════════════ */
export default function VisioApp() {
  const [page, setPage] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  // Deep links: /?page=charter etc. (used by the booking form's terms link and emails).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("page");
    if (q && NAV.some(n => n.id === q)) setPage(q);
  }, []);
  const nav = (p) => {
    setPage(p); setMenuOpen(false); window.scrollTo(0, 0);
    try { window.history.replaceState(null, "", p === "home" ? "/" : `/?page=${p}`); } catch {}
  };

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
          <button className="nav-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="תפריט" aria-expanded={menuOpen} aria-controls="nav-drawer">☰</button>
          <button className="visio-nav-mini" onClick={() => nav("home")} aria-label="VISIO — דף הבית"><Bidi>VISIO</Bidi></button>
          <div className="nav-desktop">
            {NAV.map(n => (
              <button key={n.id} className={`visio-nav-link${page === n.id ? " active" : ""}`} onClick={() => nav(n.id)}>
                {n.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {menuOpen && <div className="nav-overlay" onClick={() => setMenuOpen(false)} />}
      <aside id="nav-drawer" className={`nav-drawer ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen} aria-label="תפריט ניווט">
        <div className="nav-drawer-mark"><Bidi>VISIO</Bidi></div>
        {NAV.map(n => (
          <button key={n.id} className={`nav-drawer-btn ${page === n.id ? "active" : ""}`} onClick={() => nav(n.id)}>
            {n.label}
          </button>
        ))}
        <div style={{ padding: 24 }}>
          <button className="visio-btn block" onClick={() => nav("booking")}>הזמן צילום</button>
        </div>
      </aside>

      {/* ── CONTENT ── */}
      <main className="page-content" key={page}>
        {page === "home" && <HomeSection onNav={nav} />}
        {page === "portfolio" && <PortfolioSection />}
        {page === "pricing" && <PricingSection onNav={nav} />}
        {page === "booking" && <BookingSection />}
        {page === "charter" && <CharterSection />}
        {page === "about" && <AboutSection onNav={nav} />}
      </main>

      {/* ── FOOTER ── */}
      <footer className="visio-footer">
        <button className="visio-footer-mark" onClick={() => nav("home")} aria-label="VISIO — דף הבית"><Bidi>VISIO</Bidi></button>
        <p className="visio-footer-tag">נדל״ן. בצילום שמוכר.</p>
        <div className="visio-footer-nav">
          {NAV.map(n => (
            <button key={n.id} onClick={() => nav(n.id)}>{n.label}</button>
          ))}
        </div>
        <p className="visio-footer-legal">
          <Bidi>{`© ${new Date().getFullYear()} VISIO Photography · כל הזכויות שמורות · `}</Bidi><a href="/admin/login">כניסת צוות</a>
        </p>
        <div className="visio-footer-links">
          <a href="/privacy">מדיניות פרטיות</a>
          <a href="/accessibility">הצהרת נגישות</a>
          <button type="button" onClick={() => nav("charter")} style={{ background: "none", border: 0, color: "#cfcfcf", fontSize: 13, textDecoration: "underline", cursor: "pointer", padding: 0 }}>תנאי השירות</button>
        </div>
      </footer>
    </div>
  );
}
