import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { listTourSlugs, loadTour, validateTour } from "../lib/tours/loadTour.js";
import { PORTFOLIO, virtualTourHref, virtualTourOpensNewTab } from "../src/data/portfolio.js";

const KEPT_MATTERPORT = [
  "9YJGFmX8KbJ",
  "AF18oBWVfrm",
  "C6Uvbihrqvm",
  "Hkg7xrnXgoM",
  "cEtmuBEsSNq",
  "g1C8Upb3G6q",
  "ooDYEMx6TCr",
  "so6PszZrxgx",
];

describe("hosted tours", () => {
  it("loads the Ashdod apartment as 44 linked scenes with panoramas on disk", () => {
    expect(listTourSlugs()).toContain("ashdod-apartment");
    const tour = loadTour("ashdod-apartment");
    expect(tour).toBeTruthy();
    expect(tour.scenes).toHaveLength(44);
    expect(tour.firstScene).toBe("p27");
    expect(tour.matterportId).toBe("Hkg7xrnXgoM");
    expect(tour.assetBase).toBe("/tours/ashdod-apartment");
    expect(tour.scenes[0].title).toBe("דלת כניסה");
    expect(tour.scenes[0].hotspots.map((hotspot) => hotspot.scene)).toEqual(["p28", "p37", "p26"]);

    const dir = path.join(process.cwd(), "public", "tours", "ashdod-apartment");
    expect(validateTour(tour, dir, true)).toEqual([]);
    for (const scene of tour.scenes) {
      expect(fs.existsSync(path.join(dir, "pano", `${scene.id}_m.jpg`))).toBe(true);
      expect(fs.existsSync(path.join(dir, "pano", `${scene.id}_s.jpg`))).toBe(true);
    }
  });

  it("rejects slugs that escape the tours directory", () => {
    expect(loadTour("../package")).toBeNull();
    expect(loadTour("ashdod-apartment/../ashdod-apartment")).toBeNull();
    expect(loadTour("")).toBeNull();
    expect(loadTour("not-a-tour")).toBeNull();
  });
});

describe("portfolio virtual-tour links", () => {
  it("keeps the Dekel villa on Matterport ooDYEMx6TCr", () => {
    const dekel = PORTFOLIO.find((property) => property.sub.includes("דקר 72"));
    expect(dekel?.title).toBe("וילה · אשדוד");
    expect(dekel?.matterport).toBe("ooDYEMx6TCr");
    expect(dekel?.tour).toBeUndefined();
    expect(virtualTourHref(dekel)).toBe("https://my.matterport.com/show/?m=ooDYEMx6TCr");
    expect(virtualTourOpensNewTab(dekel)).toBe(true);
  });

  it("opens the hosted tour for Matterport Hkg7xrnXgoM", () => {
    const apartment = PORTFOLIO.find((property) => property.matterport === "Hkg7xrnXgoM");
    expect(apartment?.title).toBe("דירה · אשדוד");
    expect(apartment?.tour).toBe("ashdod-apartment");
    expect(virtualTourHref(apartment)).toBe("/tours/ashdod-apartment");
    expect(virtualTourOpensNewTab(apartment)).toBe(false);
    expect(listTourSlugs()).toContain(apartment.tour);
  });

  it("keeps every previous Matterport id and only replaces a card that has a tour slug", () => {
    const ids = PORTFOLIO.map((property) => property.matterport).filter(Boolean).sort();
    expect(ids).toEqual([...KEPT_MATTERPORT].sort());
    for (const property of PORTFOLIO) {
      const href = virtualTourHref(property);
      if (property.tour) {
        expect(href).toBe(`/tours/${property.tour}`);
      } else if (property.matterport) {
        expect(href).toBe(`https://my.matterport.com/show/?m=${property.matterport}`);
      } else {
        expect(href).toBeNull();
      }
    }
  });
});
