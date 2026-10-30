import { listTourSlugs } from "@/lib/tours/loadTour";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://visioisrael.com";

export default function sitemap() {
  const now = new Date();
  const pages = ["", "/privacy", "/accessibility"].map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: "monthly", priority: p ? 0.3 : 1 }));
  const tours = listTourSlugs().map((slug) => ({ url: `${SITE_URL}/tours/${slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.5 }));
  return [...pages, ...tours];
}
