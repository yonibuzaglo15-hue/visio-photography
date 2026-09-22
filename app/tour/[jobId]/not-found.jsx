export default function TourNotFound() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "#0a0a0a",
        color: "#e8e0d0",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ color: "#c9a84c", fontSize: 48, fontWeight: 700, letterSpacing: 2 }}>404</div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>הסיור לא נמצא</h1>
      <p style={{ margin: 0, maxWidth: 360, lineHeight: 1.7, color: "#a89878", fontSize: 14 }}>
        ייתכן שהקישור שגוי, שהסיור הוסר, או שאין סצנות גלויות לפרסום.
      </p>
      <a
        href="/"
        style={{ marginTop: 16, color: "#c9a84c", fontSize: 14, textDecoration: "underline" }}
      >
        חזרה לאתר VISIO
      </a>
    </main>
  );
}
