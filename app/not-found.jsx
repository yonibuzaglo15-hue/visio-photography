import Link from "next/link";

export const metadata = { title: "העמוד לא נמצא · VISIO Photography", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="visio-public" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
      <div className="visio-kicker"><bdi lang="en" dir="ltr">404</bdi></div>
      <h1 className="visio-section-title">העמוד לא נמצא</h1>
      <p className="visio-section-sub" style={{ marginBottom: 28 }}>ייתכן שהקישור שגוי או שהעמוד הוסר.</p>
      <Link href="/" className="visio-btn">חזרה לדף הבית</Link>
    </main>
  );
}
