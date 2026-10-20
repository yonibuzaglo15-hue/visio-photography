import fs from "fs";
import { describe, expect, it } from "vitest";
import { listTourSlugs, loadTour } from "../lib/tours/loadTour.js";

const KEPT_MATTERPORT = {
  1: "ooDYEMx6TCr",
  2: "g1C8Upb3G6q",
  3: "Z76pbSkPMXX",
  4: "9YJGFmX8KbJ",
  5: "AF18oBWVfrm",
  6: "C6Uvbihrqvm",
  7: "Xh34KkeoLb5",
  8: "so6PszZrxgx",
};

function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function portfolioFromApp() {
  const src = fs.readFileSync("src/App.jsx", "utf8");
  const start = src.indexOf("const PORTFOLIO = [");
  const end = src.indexOf("\n];", start);
  if (start < 0 || end < 0) throw new Error("PORTFOLIO array not found");
  const literal = src.slice(start + "const PORTFOLIO = ".length, end + 2);
  return Function(`"use strict"; return (${literal});`)();
}

describe("hosted tours", () => {
  it("loads the 44-scene Ashdod apartment", () => {
    expect(listTourSlugs()).toContain("ashdod-apartment");
    const tour = loadTour("ashdod-apartment");
    expect(tour).toBeTruthy();
    expect(tour.matterportId).toBe("Hkg7xrnXgoM");
    expect(tour.scenes).toHaveLength(44);
    expect(tour.firstScene).toBe("p27");
    expect(tour.assetBase).toBe("/tours/ashdod-apartment");
    expect(tour.title).toBe("דירה · אשדוד");
    expect(tour.location).toBe("שבט לוי 11");
    expect(tour.scenes[0].hotspots.length).toBeGreaterThan(0);
    expect(tour.scenes.every((scene) => typeof scene.map.x === "number")).toBe(true);
  });

  it("serves /tours/shevet-levi-11 as an alias of the same apartment", () => {
    expect(listTourSlugs()).toContain("shevet-levi-11");
    const tour = loadTour("shevet-levi-11");
    expect(tour.slug).toBe("ashdod-apartment");
    expect(tour.location).toBe("שבט לוי 11");
    expect(tour.scenes).toHaveLength(44);
    expect(tour.assetBase).toBe("/tours/ashdod-apartment");
  });

  it("loads the self-hosted שבט זבולון tour", () => {
    expect(listTourSlugs()).toContain("shevet-zevulun");
    const tour = loadTour("shevet-zevulun");
    expect(tour).toBeTruthy();
    expect(tour.scenes).toHaveLength(32);
    expect(tour.firstScene).toBe("z21");
    expect(tour.assetBase).toBe("/tours/shevet-zevulun");
    expect(tour.title).toBe("שבט זבולון 5 - גיא רוזן");
    expect(tour.location).toBe("רובע י״ב · אשדוד");
    const ids = new Set(tour.scenes.map((scene) => scene.id));
    for (const scene of tour.scenes) {
      expect(scene.hotspots.length).toBeGreaterThan(0);
      for (const h of scene.hotspots) {
        expect(ids.has(h.scene)).toBe(true);
        expect(h.pitch).toBeLessThanOrEqual(-12);
        expect(h.pitch).toBeGreaterThanOrEqual(-60);
      }
    }
  });

  it("places every שבט זבולון point on the Matterport-derived plan with a heading", () => {
    const tour = loadTour("shevet-zevulun");
    expect(tour.plan).toBe("plan.jpg");
    expect(jpegSize("public/tours/shevet-zevulun/plan.jpg")).toEqual({ width: 1442, height: 1380 });
    const seen = new Set();
    for (const scene of tour.scenes) {
      const { x, y, heading } = scene.map;
      expect(x).toBeGreaterThan(2);
      expect(x).toBeLessThan(98);
      expect(y).toBeGreaterThan(2);
      expect(y).toBeLessThan(98);
      expect(Number.isFinite(heading)).toBe(true);
      const key = `${x},${y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    // the other tour keeps its plain dots (no view cone)
    expect(loadTour("ashdod-apartment").scenes.some((scene) => "heading" in scene.map)).toBe(false);
  });

  it("loads the self-hosted יהויכין 11 tour with every Matterport point on the plan", () => {
    expect(listTourSlugs()).toContain("yehoyakin-11");
    const tour = loadTour("yehoyakin-11");
    expect(tour).toBeTruthy();
    expect(tour.scenes).toHaveLength(35);
    expect(tour.firstScene).toBe("y19");
    expect(tour.assetBase).toBe("/tours/yehoyakin-11");
    expect(tour.credit).toBe("יונתן בוזגלו | VISIO");
    expect(tour.plan).toBe("plan.jpg");
    for (const text of [tour.title, tour.location, tour.note]) {
      expect(text).not.toMatch(/re\s*\/?\s*max|re\s*house|רימקס|ריהאוס|גיא רוזן/i);
    }
    const ids = new Set(tour.scenes.map((scene) => scene.id));
    const seen = new Set();
    for (const scene of tour.scenes) {
      expect(scene.title).toMatch(/[\u0590-\u05FF]/);
      expect(scene.hotspots.length).toBeGreaterThan(0);
      for (const h of scene.hotspots) {
        expect(ids.has(h.scene)).toBe(true);
        expect(h.scene).not.toBe(scene.id);
        expect(h.pitch).toBeLessThanOrEqual(-12);
        expect(h.pitch).toBeGreaterThanOrEqual(-60);
      }
      const { x, y, heading } = scene.map;
      expect(x).toBeGreaterThan(2);
      expect(x).toBeLessThan(98);
      expect(y).toBeGreaterThan(2);
      expect(y).toBeLessThan(98);
      expect(Number.isFinite(heading)).toBe(true);
      expect(seen.has(`${x},${y}`)).toBe(false);
      seen.add(`${x},${y}`);
      expect(jpegSize(`public/tours/yehoyakin-11/pano/${scene.id}_m.jpg`)).toEqual({ width: 4096, height: 2048 });
    }
  });

  it("rejects unsafe slugs", () => {
    expect(loadTour("../etc")).toBeNull();
    expect(loadTour("nope")).toBeNull();
  });
});

describe("portfolio tour wiring", () => {
  const portfolio = portfolioFromApp();

  it("keeps every existing Matterport model", () => {
    for (const [id, model] of Object.entries(KEPT_MATTERPORT)) {
      const card = portfolio.find((item) => item.id === Number(id));
      expect(card?.matterport).toBe(model);
      expect(card?.tour).toBeUndefined();
    }
  });

  it("points the Ashdod apartment card at the hosted tour", () => {
    const card = portfolio.find((item) => item.matterport === "Hkg7xrnXgoM");
    expect(card?.title).toBe("דירה · אשדוד");
    expect(card?.sub.startsWith("שבט לוי 11")).toBe(true);
    expect(card?.tour).toBe("ashdod-apartment");
    const order = ["16", "17", "18", "19", "20", "21", "13", "14", "15", "09", "10", "11", "12", "01", "02", "03", "04", "05", "06", "07", "08"];
    expect(card?.fit).toBe("contain");
    expect(card?.hero).toBe("/portfolio/shevet-levi-11/16.jpg");
    expect(card?.gallery).toEqual(order.map((n) => `/portfolio/shevet-levi-11/${n}.jpg`));
    expect(card?.gallery.join(" ")).not.toMatch(/card\.jpg|stills\//);
    const css = fs.readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.visio-portfolio-img-wrap\.contain img \{ object-fit: contain/);
    expect(portfolio.filter((item) => item.fit === "contain").map((item) => item.id)).toEqual([10]);
  });

  it("points the שבט זבולון card at its hosted tour with the edited stills gallery", () => {
    const card = portfolio.find((item) => item.tour === "shevet-zevulun");
    expect(card?.title).toBe("שבט זבולון 5 - גיא רוזן");
    expect(card?.company).toBe("remax");
    expect(card?.tour).toBe("shevet-zevulun");
    const order = Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, "0"));
    // card cover is a separate logo-free still; the gallery keeps the branded 01..15
    expect(card?.hero).toBe("/portfolio/shevet-zevulun/cover.jpg");
    expect(card?.gallery).not.toContain(card?.hero);
    expect(jpegSize("public/portfolio/shevet-zevulun/cover.jpg")).toEqual({ width: 2560, height: 1440 });
    expect(card?.gallery).toHaveLength(15);
    expect(card?.gallery).toEqual(order.map((n) => `/portfolio/shevet-zevulun/${n}.jpg`));
    expect(card?.gallery.join(" ")).not.toMatch(/cover\.jpg|stills\//);
    for (const src of card.gallery) expect(fs.existsSync(`public${src}`)).toBe(true);
    // sequential 01..15 only, no leftovers from the previous set; every still is 2560x1440
    const files = fs.readdirSync("public/portfolio/shevet-zevulun").sort();
    expect(files).toEqual([...order.map((n) => `${n}.jpg`), "cover.jpg"]);
    for (const f of files) expect(jpegSize(`public/portfolio/shevet-zevulun/${f}`)).toEqual({ width: 2560, height: 1440 });
  });

  it("points the יהויכין 11 card at its hosted tour", () => {
    const card = portfolio.find((item) => item.id === 13);
    expect(card?.title).toBe("יהויכין 11 · אשדוד");
    expect(card?.tour).toBe("yehoyakin-11");
    expect(card?.matterport).toBeUndefined();
    expect(card?.tag).toBe("דירה + סיור וירטואלי");
    expect(card?.tags).toContain("סיור וירטואלי 3D");
    expect(card?.gallery[0]).toBe("/portfolio/yehoyachin-11/01.jpg");
  });

  it("opens /tours/<slug> when tour is set, otherwise Matterport", () => {
    const src = fs.readFileSync("src/App.jsx", "utf8");
    expect(src).toMatch(/p\.tour\n\s+\? `\/tours\/\$\{p\.tour\}`/);
    expect(src).toContain("https://my.matterport.com/show/?m=${p.matterport}");
  });
});

describe("viewer stage stays ltr", () => {
  it("pins the panorama container and hotspot origin", () => {
    const viewer = fs.readFileSync("src/tours/TourViewer.jsx", "utf8");
    const css = fs.readFileSync("src/tours/tour.css", "utf8");
    expect(viewer).toContain('className="visio-tour-pano" dir="ltr"');
    expect(css).toContain("direction: ltr");
    expect(css).toMatch(/\.pnlm-hotspot-base\s*\{[^}]*left:\s*0/);
    expect(css).toMatch(/\.ring \.rg\s*\{[^}]*left:\s*-38px/);
    expect(css).toMatch(/width:\s*76px/);
    expect(css).toMatch(/height:\s*38px/);
  });
});

describe("card text never mentions RE/MAX", () => {
  const src = fs.readFileSync("src/App.jsx", "utf8");
  const portfolio = portfolioFromApp();
  const cardTagLine = (() => {
    const start = src.indexOf("export const cardTagLine");
    const end = src.indexOf("\n};", start);
    const code = src.slice(start, end + 3).replace(/export /g, "");
    return Function(`"use strict"; ${code}; return cardTagLine;`)();
  })();
  const REMAX = /re\s*\/?\s*max|רימקס|רי\/מקס/i;

  it("no card title, kicker, subtitle or tag line contains RE/MAX", () => {
    for (const p of portfolio) {
      for (const text of [p.title, p.tag, p.sub, cardTagLine(p), ...(p.tags || [])]) {
        expect(text || "", `card ${p.id}`).not.toMatch(REMAX);
      }
    }
  });

  it("never renders the partner on a card", () => {
    const jsx = src.split("\n").filter((l) => /<Bidi>|className=/.test(l));
    expect(jsx.filter((l) => /\b(p|lead)\.partner\b/.test(l))).toEqual([]);
  });

  it("uses the exact tag line for שבט זבולון 5 and drops RE/MAX from חסידא 17", () => {
    const zev = portfolio.find((p) => p.id === 16);
    expect(cardTagLine(zev)).toBe("מרפסת · סלון · מטבח · סיור וירטואלי 3D");
    const hasida = portfolio.find((p) => p.id === 15);
    expect(cardTagLine(hasida)).toBe("מטבח · פינת אוכל");
  });
});

describe("gallery lightbox (all cards)", () => {
  const src = fs.readFileSync("src/App.jsx", "utf8");
  const css = fs.readFileSync("app/globals.css", "utf8");
  const helpers = (() => {
    const start = src.indexOf("export const SWIPE_MIN_PX");
    const end = src.indexOf("function Lightbox(");
    const code = src.slice(start, end).replace(/export /g, "");
    return Function(`"use strict"; ${code}; return { swipeStep, keyStep, SWIPE_MIN_PX };`)();
  })();

  it("uses a dark opaque backdrop and an unframed, contained image", () => {
    expect(css).toMatch(/\.visio-lightbox \{[^}]*background: rgba\(0, 0, 0, 0\.96\)/);
    const img = css.match(/\.visio-lightbox img \{([^}]*)\}/)[1];
    expect(img).toMatch(/max-height: 80vh/);
    expect(img).toMatch(/max-width: 100%/);
    expect(img).toMatch(/object-fit: contain/);
    expect(img).toMatch(/border: 0/);
    expect(img).toMatch(/padding: 0/);
    expect(css).not.toMatch(/\.visio-lightbox img \{ max-height: 70vh/);
    expect(css).toMatch(/\.visio-lightbox \.visio-icon-btn \{[^}]*color: #f2f2f2/);
    expect(css).toMatch(/\.visio-lightbox \.visio-credit \{[^}]*color: #e6e6e6/);
  });

  it("locks page scroll while open and restores it on close", () => {
    expect(src).toContain('document.body.style.overflow = "hidden"');
    expect(src).toContain("document.body.style.overflow = prev");
  });

  it("keeps Esc + arrow keys and adds RTL-aware swipe", () => {
    expect(src).toContain('e.key === "Escape"');
    expect(helpers.keyStep("ArrowLeft")).toBe(1);
    expect(helpers.keyStep("ArrowRight")).toBe(-1);
    expect(helpers.keyStep("Enter")).toBe(0);
    expect(helpers.swipeStep(120, 10)).toBe(1);
    expect(helpers.swipeStep(-120, 10)).toBe(-1);
    expect(helpers.swipeStep(helpers.SWIPE_MIN_PX - 1, 0)).toBe(0);
    expect(helpers.swipeStep(60, 200)).toBe(0); // vertical drag is not a swipe
    expect(src).toContain("onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}");
  });
});

describe("Yan Shindelman (REHOUSE) works", () => {
  const portfolio = portfolioFromApp();
  const YAN = [
    [17, "shevet-levi-4", "שבט לוי 4", "רובע י״ב · אשדוד", "xZ4M9pKzoBr", 14],
    [18, "atzmaut-21", "העצמאות 21", "סיטי · אשדוד", "eqKC1zuQDfa", 18],
    [19, "tzionut-55", "הציונות 55", "סיטי · אשדוד", "m1ArnEzVJCY", 14],
    [20, "kalanit-7a", "הכלנית 7א", "רובע ח׳ · אשדוד", "YcGsq9ppCTT", 19],
    [21, "ussishkin-21", "אוסישקין 21", "רובע ט״ו · אשדוד", "x8CmoHwwyA1", 12],
    [22, "petah-tikva-9", "פתח תקווה 9", "רובע ט׳ · אשדוד", "FkkW9mVhJC4", 17],
    [23, "agnon-21", "שי עגנון 21", "עתיקות · אשקלון", "JN6a8HHqRpX", 11],
    [24, "nahal-snir-9", "נחל שניר 9", "רובע י״א · אשדוד", "mDADwNnNKtD", 13],
    [25, "micha-hanavi-13", "מיכה הנביא 13", "רובע י׳ · אשדוד", null, 14],
    [26, "harav-kook-19", "הרב קוק 19", "רובע ב׳ · אשדוד", null, 16],
    [27, "haeshkol-8", "האשכול 8", "רובע א׳ · אשדוד", "mWxuq2zaKdZ", 16],
    [28, "milman-2", "מילמן 2", "רובע ו׳ · אשדוד", null, 19],
  ];

  it.each(YAN)("card %i (%s) has title, location, tour and a full local gallery", (id, slug, street, sub, model, count) => {
    const card = portfolio.find((p) => p.id === id);
    expect(card.title).toBe(`${street} - יאן שינדלמן`);
    expect(card.sub).toBe(sub);
    expect(card.company).toBe("rehouse");
    expect(card.tour).toBeUndefined();
    if (model) {
      expect(card.matterport).toBe(model);
      expect(card.tag).toMatch(/\+ סיור וירטואלי$/);
      expect(card.tags).toContain("סיור וירטואלי 3D");
    } else {
      expect(card.matterport).toBeUndefined();
      expect(card.tag).toBe("דירה");
    }
    expect(card.hero).toBe(`/portfolio/${slug}/cover.jpg`);
    expect(card.gallery).not.toContain(card.hero);
    const order = Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, "0"));
    expect(card.gallery).toEqual(order.map((n) => `/portfolio/${slug}/${n}.jpg`));
    const files = fs.readdirSync(`public/portfolio/${slug}`).sort();
    expect(files).toEqual([...order.map((n) => `${n}.jpg`), "cover.jpg"]);
    const size = jpegSize(`public/portfolio/${slug}/cover.jpg`);
    expect(size.width * 9).toBe(size.height * 16);
    for (const f of files) expect(jpegSize(`public/portfolio/${slug}/${f}`)).toEqual(size);
  });

  it("marks הציונות 55 as a penthouse", () => {
    expect(portfolio.find((p) => p.id === 19).tag).toBe("פנטהאוז + סיור וירטואלי");
  });

  it("never names the brokerage in Yan card text", () => {
    for (const p of portfolio.filter((c) => c.id >= 17)) {
      for (const text of [p.title, p.tag, p.sub, ...(p.tags || [])]) {
        expect(text).not.toMatch(/re\s*\/?\s*max|re\s*house|רימקס|ריהאוס/i);
      }
    }
  });

  it("uses unique ids and never reuses an image path across cards", () => {
    const ids = portfolio.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const all = portfolio.flatMap((p) => p.gallery || []);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("REHOUSE works grouped by region", () => {
  const src = fs.readFileSync("src/App.jsx", "utf8");
  const portfolio = portfolioFromApp();
  const helpers = (() => {
    const start = src.indexOf("const KNOWN_CITIES");
    const end = src.indexOf("// Card tag line:", start);
    const code = src.slice(start, end).replace(/export /g, "");
    return Function(`"use strict"; ${code}; return { cityOf, groupByCity };`)();
  })();
  const companyOf = (p) => p.company || (/re\s*\/?\s*max/i.test(p.partner || "") ? "remax" : /re\s*house/i.test(p.partner || "") ? "rehouse" : null);
  const rehouse = portfolio.filter((p) => companyOf(p) === "rehouse");

  it("gives every card an explicit city that matches its title/location", () => {
    for (const p of portfolio) {
      expect(["אשדוד", "אשקלון", "יבנה"], `card ${p.id}`).toContain(p.city);
      if (/אשקלון|יבנה|אשדוד/.test(`${p.title} ${p.sub}`)) expect(`${p.title} ${p.sub}`).toContain(p.city);
    }
    expect(portfolio.find((p) => p.id === 23).city).toBe("אשקלון");
    expect(portfolio.find((p) => p.id === 5).city).toBe("יבנה");
  });

  it("derives a city from the location line when the field is missing", () => {
    expect(helpers.cityOf({ sub: "עתיקות · אשקלון" })).toBe("אשקלון");
    expect(helpers.cityOf({ title: "הפטל 17 · יבנה", sub: "גינה" })).toBe("יבנה");
    expect(helpers.cityOf({ title: "x", sub: "y" })).toBe("אחר");
  });

  it("orders REHOUSE regions אשדוד first, then אשקלון, then יבנה, keeping card order", () => {
    const groups = helpers.groupByCity(rehouse);
    expect(groups.map((g) => g.city)).toEqual(["אשדוד", "אשקלון", "יבנה"]);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(rehouse.length);
    expect(groups[1].items.map((p) => p.id)).toEqual([23]);
    expect(groups[2].items.map((p) => p.id)).toEqual([5]);
    const ashdod = groups[0].items.map((p) => p.id);
    expect(ashdod).toEqual([...ashdod].sort((a, b) => a - b));
    expect(helpers.groupByCity([{ id: 1, city: "באר שבע" }, { id: 2, city: "יבנה" }, { id: 3, city: "אשדוד" }]).map((g) => g.city)).toEqual(["אשדוד", "יבנה", "באר שבע"]);
  });

  it("renders region sections only on the REHOUSE filter and updates the subtitle", () => {
    expect(src).toContain('company === "rehouse" ? (');
    expect(src).toContain("groupByCity(shown).map(");
    expect(src).toContain('<span className="visio-kicker">{city}</span>');
    expect(src).toContain('sub="נכסי יוקרה · אשדוד · אשקלון · יבנה"');
    expect(src).not.toContain("אשדוד ויבנה");
    const css = fs.readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.visio-region-head \{/);
  });
});
