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
  "title": "סיור וירטואלי",
  "location": "דירה · אשדוד",
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
{ title: "דירה · אשדוד", matterport: "Hkg7xrnXgoM", tour: "ashdod-apartment" }
```

Optional `assetBase` (`https://…`) loads panoramas and the plan from another host, such as Vercel Blob, instead of this folder. Local `pano/` files are then not required. The default is `/tours/<slug>`.

The viewer keeps the panorama stage `dir="ltr"` even though the page is RTL. That is what keeps the floor rings on the spot while you turn. Do not remove it.

Pannellum 2.5.6 is vendored at `public/vendor/pannellum/` (MIT).

### This apartment

`public/tours/ashdod-apartment/` is the 44-scene tour that was on `rehouse-tour.vercel.app`, Matterport `Hkg7xrnXgoM`. The live source does not publish full-size `pNN.jpg` or a `/thumb/` directory (both 404). The player only requests `pano/<id>_m.jpg` and `pano/<id>_s.jpg`, 88 files, about 31MB, so those are what is in the repo. Hosting them here means the tour does not depend on the other Vercel project staying up, and adding the next tour is the same folder drop.
