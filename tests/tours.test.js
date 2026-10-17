import fs from "fs";
import { describe, expect, it } from "vitest";
import { listTourSlugs, loadTour } from "../lib/tours/loadTour.js";

const KEPT_MATTERPORT = {
  1: "ooDYEMx6TCr",
  2: "g1C8Upb3G6q",
  3: "cEtmuBEsSNq",
  4: "9YJGFmX8KbJ",
  5: "AF18oBWVfrm",
  6: "C6Uvbihrqvm",
  8: "so6PszZrxgx",
};

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

  it("opens /tours/<slug> when tour is set, otherwise Matterport", () => {
    const src = fs.readFileSync("src/App.jsx", "utf8");
    expect(src).toContain("p.tour\n            ? `/tours/${p.tour}`");
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
