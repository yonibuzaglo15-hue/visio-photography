import { notFound } from "next/navigation";
import { loadPublicTour } from "@/lib/tour/load-public-tour.js";
import TourViewerClient from "./TourViewerClient.jsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }) {
  const data = await loadPublicTour(params.jobId);
  if (!data) {
    return {
      title: "סיור לא נמצא — VISIO",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: data.pageTitle,
    description: data.pageTitle,
    robots: { index: false, follow: false },
    openGraph: {
      title: data.pageTitle,
      description: "סיור וירטואלי 360° — VISIO Photography",
      type: "website",
      ...(data.ogImage
        ? { images: [{ url: data.ogImage, width: 4096, height: 2048 }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: data.pageTitle,
      ...(data.ogImage ? { images: [data.ogImage] } : {}),
    },
  };
}

export default async function PublicTourPage({ params }) {
  const data = await loadPublicTour(params.jobId);
  if (!data) notFound();

  return <TourViewerClient config={data.config} />;
}
