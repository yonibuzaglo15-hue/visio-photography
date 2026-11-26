import FullWorks from "@/src/portfolio/FullWorks";
import ThemeToggle from "@/src/theme/ThemeToggle.jsx";

export const metadata = {
  title: "כל העבודות · VISIO Photography",
  description: "כל הנכסים שצולמו על ידי VISIO. אשדוד, אשקלון ויבנה.",
};

export default function WorksPage() {
  return (
    <div className="visio-public">
      <header className="visio-works-bar">
        <a className="visio-legal-brand" href="/">VISIO</a>
        <ThemeToggle />
      </header>
      <main id="main">
        <FullWorks />
      </main>
    </div>
  );
}
