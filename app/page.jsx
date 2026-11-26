import VisioApp from "@/src/App";

export default function HomePage() {
  return (
    <>
      <link rel="preload" as="image" href="/home/8/hero.webp" fetchPriority="high" />
      <VisioApp />
    </>
  );
}
