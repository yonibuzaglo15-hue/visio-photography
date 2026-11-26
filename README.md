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
  "title": "אשדוד",
  "location": "",
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

Then add the property at the **top** of `src/data/portfolio.json` (newest first) and set `tour` to that slug. The card button opens `/tours/<slug>` on this site. Leave `matterport` in place if you still want the original model id recorded. Cards without `tour` keep opening Matterport. Set `hero` and `gallery` to stills under `public/portfolio/<slug>/`. A handful of early shoots still use `src/data/property-images.js` when those fields are omitted.

## Adding a property

One new shoot is one object plus one folder. Nothing else in the app has to change.

1. Put the stills in `public/portfolio/<slug>/` (`cover.jpg` and `01.jpg`, `02.jpg`, …). `<slug>` is the area, never the street (`rova-5`, `atikot`).
2. Insert one object as the **first** item of `src/data/portfolio.json`. The array order is newest first, and that is the order on `/works` and on the company tabs.
3. `title` is the neighbourhood or area and the city (`רובע ה׳, אשדוד`). Do not put a street or a house number in `title`, `sub`, `tag`, `tags`, or the file names. An agent name may stay (`רובע י״ב, אשדוד - גיא רוזן`).
4. `company` is `rehouse` or `remax`. `partner` is stored for that filter and is not drawn on the card.
5. Optional `tour` points at `public/tours/<slug>/`. Optional `matterport` is the model id. Optional `fit: "contain"` keeps a banner from being cropped.

The field list is `src/data/portfolio.schema.json`. The home tab "הכל" stays the six selected covers (`SELECTED_WORK_IDS` in `src/data/portfolio.js`). Every other property is on the REHOUSE and RE/MAX tabs and on `/works`.

```json
{
  "id": 31,
  "title": "רובע ה׳, אשדוד",
  "sub": "סלון · מטבח",
  "city": "אשדוד",
  "tag": "דירה",
  "partner": "RE/MAX",
  "company": "remax",
  "hero": "/portfolio/rova-5b/cover.jpg",
  "gallery": ["/portfolio/rova-5b/01.jpg"]
}
```

```js
{ title: "אשדוד", sub: "מרפסת · סלון · מטבח · 44 נקודות", matterport: "Hkg7xrnXgoM", tour: "ashdod-apartment" }
```

`title` and `location` are joined in the tour header and the browser tab. Public captions use the neighbourhood and city, not the street. Older street-name URLs redirect to the current slug.

Optional `assetBase` (`https://…`) loads panoramas and the plan from another host, such as Vercel Blob, instead of this folder. Local `pano/` files are then not required. The default is `/tours/<slug>`.

The viewer keeps the panorama stage `dir="ltr"` even though the page is RTL. That is what keeps the floor rings on the spot while you turn. Do not remove it.

### Measuring

Dimensions are an estimate, not a survey. Say so in `note`.

The viewer shows them in two ways, for every tour that has the data:

- **Automatic, on by default.** Each visible Matterport wall is drawn on the floor at that wall’s face, labelled with the distance between Matterport’s own vertices. Door and window labels use Matterport’s opening width. Ceiling height, and width × depth, appear only when Matterport published those numbers (they are in feet in the API and shown in metres). A room with no published width, such as the open salon, does not get an estimated box. Segments behind the camera or behind another wall are hidden. Furniture is not in the model, so a line can still draw over a bed that stands in front of a wall. The minimap shows width × depth only for rooms where Matterport published both.
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
| חסידא, יהויכין | No `matterportId`. Floor-ring headings share a scale, so the manual ruler works on the floor only (lens height assumed 1.27 m, the שבט לוי camera). Add the model id and run the script for real room sizes. |
| שבט זבולון | No `matterportId`, and the floor rings do not share one scale, so there is no ruler at all. Same fix: model id, then the script. |

There is no depth mesh in the repo. Furniture and open doorways are not solid.

Pannellum 2.5.6 is vendored at `public/vendor/pannellum/` (MIT).

### This apartment

`public/tours/ashdod-apartment/` is the 44-scene tour of an apartment in אשדוד (Matterport `Hkg7xrnXgoM`), formerly hosted on `rehouse-tour.vercel.app`. Older street-name URLs redirect here. The live source does not publish full-size `pNN.jpg` or a `/thumb/` directory (both 404). The player only requests `pano/<id>_m.jpg` and `pano/<id>_s.jpg`, 88 files, about 31MB, so those are what is in the repo. Hosting them here means the tour does not depend on the other Vercel project staying up, and adding the next tour is the same folder drop.
