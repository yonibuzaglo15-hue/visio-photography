export const PROPERTY_IMAGES = {
  1: { hero: "/home/1/hero.webp", gallery: ["/home/1/01.webp"] },
  2: { hero: "/home/2/hero.webp", gallery: ["/home/2/01.webp"] },
  5: { hero: "/home/5/hero.webp", gallery: ["/home/5/01.webp", "/home/5/02.webp", "/home/5/03.webp", "/home/5/04.webp", "/home/5/05.webp", "/home/5/06.webp"] },
  7: { hero: "/home/7/hero.webp", gallery: ["/home/7/01.webp", "/home/7/02.webp", "/home/7/03.webp", "/home/7/04.webp", "/home/7/05.webp", "/home/7/06.webp", "/home/7/07.webp", "/home/7/08.webp"] },
  8: { hero: "/home/8/hero.webp", gallery: ["/home/8/01.webp", "/home/8/02.webp", "/home/8/03.webp", "/home/8/04.webp", "/home/8/05.webp", "/home/8/06.webp", "/home/8/07.webp", "/home/8/08.webp"] },
  9: { hero: "/home/9/hero.webp", gallery: ["/home/9/01.webp", "/home/9/02.webp", "/home/9/03.webp", "/home/9/04.webp", "/home/9/05.webp", "/home/9/06.webp", "/home/9/07.webp", "/home/9/08.webp"] },
};

export function mediaFor(property) {
  const extra = PROPERTY_IMAGES[property.id] || {};
  const gallery = property.gallery || extra.gallery || [];
  return { hero: property.hero || extra.hero || "", gallery };
}
