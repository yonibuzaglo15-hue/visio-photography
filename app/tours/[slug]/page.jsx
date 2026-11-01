import { notFound } from "next/navigation";
import { listTourSlugs, loadTour } from "@/lib/tours/loadTour";
import TourViewer from "@/src/tours/TourViewer";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return listTourSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }) {
  const tour = loadTour(params.slug);
  if (!tour) return { title: "סיור וירטואלי · VISIO" };
  const heading = [tour.title || "סיור וירטואלי", tour.location].filter(Boolean).join(" · ");
  return {
    title: `${heading} · VISIO`,
    description: (tour.note || "סיור וירטואלי 360° · VISIO Photography").split("\n")[0],
  };
}

export default function TourPage({ params }) {
  const tour = loadTour(params.slug);
  if (!tour) notFound();
  return <TourViewer tour={tour} />;
}
