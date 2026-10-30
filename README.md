# VISIO Photography

Hebrew site for VISIO real-estate photography. Portfolio cards can open a Matterport model or a tour hosted on this site.

## Adding a virtual tour

A tour is a folder. Drop it in `public/tours/<slug>/` and point a portfolio card at that slug. The page is `/tours/<slug>`.

```
public/tours/<slug>/
  tour.json          scene list, floor-plan dots, Hebrew copy
  plan.jpg           mini-map (optional)
  card.jpg           still used on the portfolio card (optional)
  pano/
    <id>_m.jpg       4096×2048, used when the device allows a 4096px texture
    <id>_s.jpg       smaller fallback, also the rooms-bar thumbnail
```

`<slug>` is lowercase letters, digits, and hyphens (`ashdod-apartment`). `<id>` in the panoramas matches `scenes[].id` (`p27`, …).

`tour.json`:

```json
{
  "title": "דירה · אשדוד",
  "location": "שבט לוי 11",
  "aliases": ["shevet-levi-11"],
  "credit": "יונתן בוזגלו | VISIO",
  "matterportId": "Hkg7xrnXgoM",
  "firstScene": "p27",
  "hfov": 105,
  "pitch": -10,
  "plan": "plan.jpg",
  "note": "הסיור מבוסס על צילומי 360° ונועד להתרשמות בלבד.\nלחצו על העיגולים ברצפה כדי לעבור בין נקודות.",
  "scenes": [
    {
      "id": "p27",
      "title": "דלת כניסה",
      "map": { "x": 83.93, "y": 71.28 },
      "hotspots": [
        { "scene": "p28", "yaw": -150, "pitch": -51.1 }
      ]
    }
  ]
}
```

`map.x` / `map.y` are percentages on `plan.jpg` (left / top). `hotspots[].yaw` and `pitch` are the floor-ring position inside that panorama. Each hotspot `scene` must be another scene id. Scene order in the array is the order of the rooms bar.

Then, in the `PORTFOLIO` array in `src/App.jsx`, set `tour` on the property. The card button opens `/tours/<slug>` on this site. Leave `matterport` in place if you still want the original model id recorded. Cards without `tour` keep opening Matterport. A card can also set `hero` and `gallery` to stills in this folder when it has no entry in `PROPERTY_IMAGES`.

```js
{ title: "דירה · אשדוד", sub: "שבט לוי 11 · מרפסת · סלון · מטבח · 44 נקודות", matterport: "Hkg7xrnXgoM", tour: "ashdod-apartment" }
```

`title` and `location` are joined in the tour header and the browser tab (`דירה · אשדוד · שבט לוי 11`). Optional `aliases` are extra slugs for the same folder. `/tours/shevet-levi-11` opens this apartment; the panoramas still load from `/tours/ashdod-apartment`.

Optional `assetBase` (`https://…`) loads panoramas and the plan from another host, such as Vercel Blob, instead of this folder. Local `pano/` files are then not required. The default is `/tours/<slug>`.

The viewer keeps the panorama stage `dir="ltr"` even though the page is RTL. That is what keeps the floor rings on the spot while you turn. Do not remove it.

### Measuring

Dimensions are an estimate, not a survey. Say so in `note`.

The viewer shows them in two ways, for every tour that has the data:

- **Automatic, on by default.** When `measure.json` contains `rooms`, entering a panorama draws that room’s two main dimensions on the floor and a small label (`3.75 × 3.10 מ׳ · גובה 2.60 מ׳`). The current room’s size is also marked on the minimap. The button next to the info button hides them. Open-plan rooms that are not a rectangle are labelled as main walls plus area, so a 10 m bounding box is not presented as the room.
- **Manual, off by default.** The ruler button measures two clicks. It needs sweep poses (`scenes` in `measure.json`). Walls make the click hit a wall; otherwise it hits the floor plane.

Generate `measure.json` from a public Matterport model:

```bash
node tools/measure/from-matterport.mjs public/tours/<slug>
```

`tour.json` must have `matterportId` (the id in `my.matterport.com/show/?m=`). The model has to be public. The script reads room outlines, interior width/depth/ceiling height, and sweep poses, and writes `measure.json`. Re-running keeps panorama poses that are already there and refreshes the rooms.

A new tour gets automatic dimensions by dropping the folder as usual, setting `matterportId`, and running that command. No viewer change.

What is still missing on the tours that do not show automatic dimensions:

| Tour | Missing |
| --- | --- |
| חסידא 17, יהויכין 11 | No `matterportId`. Floor-ring headings share a scale, so the manual ruler works on the floor only (lens height assumed 1.27 m, the שבט לוי camera). Add the model id and run the script for real room sizes. |
| שבט זבולון | No `matterportId`, and the floor rings do not share one scale, so there is no ruler at all. Same fix: model id, then the script. |

There is no depth mesh in the repo. Furniture and open doorways are not solid.

Pannellum 2.5.6 is vendored at `public/vendor/pannellum/` (MIT).

### This apartment

`public/tours/ashdod-apartment/` is the 44-scene tour of the apartment at שבט לוי 11, אשדוד (Matterport `Hkg7xrnXgoM`), formerly hosted on `rehouse-tour.vercel.app`. `/tours/shevet-levi-11` is an alias of the same tour. The live source does not publish full-size `pNN.jpg` or a `/thumb/` directory (both 404). The player only requests `pano/<id>_m.jpg` and `pano/<id>_s.jpg`, 88 files, about 31MB, so those are what is in the repo. Hosting them here means the tour does not depend on the other Vercel project staying up, and adding the next tour is the same folder drop.
