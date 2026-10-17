/**
 * Portfolio cards on the public site.
 *
 * `tour` is a folder slug under public/tours/<slug>/ (see README).
 * When it is set, the "סיור וירטואלי 3D" button opens /tours/<slug> on this site.
 * `matterport` is kept for models we have not replaced yet and is what the
 * button opens when `tour` is absent.
 */

export const PORTFOLIO = [
  { id: 1, title: "וילה · אשדוד", sub: "דקר 72 · בריכה פרטית · דק עץ", type: "PRESTIGE", tag: "רחפן + סיור וירטואלי", partner: "ReHouse", matterport: "ooDYEMx6TCr", tags: ["בריכה", "דק עץ", "סיור וירטואלי"] },
  { id: 2, title: "שבט לוי 1 · אשדוד", sub: "מרפסת פינורמית · נוף ים", type: "PRESTIGE", tag: "נוף", partner: "ReHouse", matterport: "g1C8Upb3G6q", tags: ["מרפסת", "נוף"] },
  { id: 3, title: "נחל שניר 21 · אשדוד", sub: "קיר שיש · פרקט אירופאי", type: "PRESTIGE", tag: "בוטיק", partner: "ReHouse", matterport: "cEtmuBEsSNq", tags: ["קיר שיש", "פרקט", "בוטיק"] },
  { id: 4, title: "בלפור 7 · אשדוד", sub: "לובי יוקרה · שיש איטלקי", type: "PRESTIGE", tag: "לובי יוקרה", partner: "ReHouse", matterport: "9YJGFmX8KbJ", tags: ["לובי יוקרה", "שיש"] },
  { id: 5, title: "הפטל 17 · יבנה", sub: "גינה · פרגולה · עצי לימון", type: "PRESTIGE", tag: "גינה", partner: "ReHouse", matterport: "AF18oBWVfrm", tags: ["גינה", "פרגולה", "עצי לימון"] },
  { id: 6, title: "המשוט 8 · אשדוד", sub: "גינה · שיש · סלון מרווח", type: "PRESTIGE", tag: "גינה + שיש", partner: "ReHouse", matterport: "C6Uvbihrqvm", tags: ["גינה", "שיש", "סלון"] },
  { id: 7, title: "אבות ישורון 18 · אשדוד", sub: "דירת גן · 2 גינות · פרגולה · סלון מעוצב", type: "PRESTIGE", tag: "גינה + פרגולה", partner: "ReHouse", tags: ["דירת גן", "גינה", "פרגולה", "סלון מרווח"] },
  { id: 8, title: "קרן היסוד 43 · אשדוד", sub: "פנטהאוז · גג יוקרתי · בר + מטבח חיצוני", type: "PRESTIGE", tag: "פנטהאוז + גג", partner: "ReHouse", matterport: "so6PszZrxgx", tags: ["פנטהאוז", "גג מעוצב", "בר", "סיור וירטואלי"] },
  { id: 9, title: "הגלים 11 · אשדוד", sub: "וילה פרטית · גינה מטופחת · חדר הורים מפנק", type: "PRESTIGE", tag: "וילה + גינה", partner: "ReHouse", tags: ["וילה", "גינה", "חדר הורים", "מרוהטת"] },
  {
    id: 10,
    title: "דירה · אשדוד",
    sub: "מרפסת · סלון · מטבח · 44 נקודות",
    type: "PRESTIGE",
    tag: "סיור וירטואלי",
    partner: "ReHouse",
    matterport: "Hkg7xrnXgoM",
    tour: "ashdod-apartment",
    hero: "/tours/ashdod-apartment/card.jpg",
    gallery: [
      "/tours/ashdod-apartment/card.jpg",
      "/tours/ashdod-apartment/stills/living.jpg",
      "/tours/ashdod-apartment/stills/entrance.jpg",
    ],
    tags: ["מרפסת", "סלון", "מטבח", "סיור וירטואלי"],
  },
];

export function virtualTourHref(property) {
  if (property?.tour) return `/tours/${property.tour}`;
  if (property?.matterport) return `https://my.matterport.com/show/?m=${property.matterport}`;
  return null;
}

export function virtualTourOpensNewTab(property) {
  return !property?.tour && !!property?.matterport;
}
