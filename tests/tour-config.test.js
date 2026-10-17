import { describe, expect, it } from "vitest";
import {
  buildTourConfig,
  configToEditorScenes,
  configToFloorPlans,
  panoramasToEditorScenes,
} from "../lib/tour/tour-config.js";
import { friendlyRoomLabel, looksLikeFileOrId } from "../lib/tour/room-label.js";

const scenes = [
  {
    id: "scene_0",
    title: "סלון",
    panoramaUrl: "https://x/uploads/j/IMG_20260922_130035_366.JPG",
    mapX: 0.4,
    mapY: 0.55,
    mapPlanId: "plan-a",
    floor: 0,
    hotSpots: [
      { id: "h1", yaw: 10, pitch: -30, targetSceneId: "scene_1" },
      { id: "h2", yaw: 90, pitch: -25, targetSceneId: "scene_2" },
    ],
  },
  { id: "scene_1", title: "IMG_20260922_130037_407", panoramaUrl: "https://x/b.jpg", hotSpots: [] },
  { id: "scene_2", title: "מחסן", hidden: true, panoramaUrl: "https://x/c.jpg", hotSpots: [] },
];

describe("room labels", () => {
  it("never shows camera filenames or scene ids", () => {
    expect(friendlyRoomLabel({ title: "סלון", id: "scene_0" })).toBe("סלון");
    expect(friendlyRoomLabel({ title: "IMG_20260922_130035_366", id: "scene_2" }, 3)).toBe("חדר 3");
    expect(friendlyRoomLabel({ title: "pano.jpg", id: "scene_4" })).toBe("חדר 5");
    expect(friendlyRoomLabel({ title: "scene_7", id: "scene_7" })).toBe("חדר 8");
    expect(friendlyRoomLabel({ id: "scene_0" })).toBe("חדר 1");
    expect(looksLikeFileOrId("חדר שינה")).toBe(false);
  });
});

describe("tour config", () => {
  it("public config drops hidden scenes and every hotspot pointing at them", () => {
    const pub = buildTourConfig({ scenes, firstSceneId: "scene_2", includeHidden: false });
    expect(Object.keys(pub.scenes)).toEqual(["scene_0", "scene_1"]);
    expect(pub.scenes.scene_0.hotSpots.map((h) => h.sceneId)).toEqual(["scene_1"]);
    expect(pub.default.firstScene).toBe("scene_0");
  });

  it("stored config keeps hidden scenes for the editor round-trip", () => {
    const stored = buildTourConfig({
      scenes,
      includeHidden: true,
      floorPlans: [{ floor: 0, url: "https://x/tours/j/floorplan-f0-abc.jpg" }],
    });
    expect(stored.scenes.scene_2.hidden).toBe(true);
    const back = configToEditorScenes(stored);
    expect(back.find((s) => s.id === "scene_2").hidden).toBe(true);
    expect(back[0]).toMatchObject({ mapX: 0.4, mapY: 0.55, mapPlanId: "plan-a", floor: 0 });
    expect(back[0].hotSpots[0]).toMatchObject({ yaw: 10, pitch: -30, targetSceneId: "scene_1" });
    expect(configToFloorPlans(stored)[0].planId).toBe("floorplan-f0-abc");
  });

  it("titles and hotspot labels are friendly, never filenames", () => {
    const stored = buildTourConfig({ scenes, includeHidden: true });
    expect(stored.scenes.scene_1.title).toBe("חדר 2");
    expect(stored.scenes.scene_0.hotSpots[0].text).toBe("חדר 2");
    for (const s of panoramasToEditorScenes([{ url: "u", name: "IMG_1.JPG" }])) {
      expect(looksLikeFileOrId(s.title)).toBe(false);
    }
  });

  it("writes no calibration / auto-link leftovers", () => {
    const stored = buildTourConfig({ scenes, includeHidden: true });
    const json = JSON.stringify(stored);
    for (const k of ["northOffset", "floorPlanMeta", "metersPerNorm", "deletedLinks", "\"source\""]) {
      expect(json).not.toContain(k);
    }
  });
});
