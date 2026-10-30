import { notFound } from "next/navigation";
import { listTourSlugs, loadTour } from "@/lib/tours/loadTour";
import TourViewer from "@/src/tours/TourViewer";

export function generateStaticParams() {
  return listTourSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tour = loadTour(slug);
  if (!tour) return { title: "סיור וירטואלי · VISIO" };
  const heading = [tour.title || "סיור וירטואלי", tour.location].filter(Boolean).join(" · ");
  return {
    title: `${heading} · VISIO`,
    description: (tour.note || "סיור וירטואלי 360° · VISIO Photography").split("\n")[0],
  };
}

export default async function TourPage({ params }) {
  const { slug } = await params;
  const tour = loadTour(slug);
  if (!tour) notFound();
  return <TourViewer tour={tour} />;
}
