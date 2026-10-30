import Link from "next/link";

/** Minimal shell for standalone legal pages (privacy, accessibility). Same tokens as the public site. */
export default function LegalShell({ children }) {
  return (
    <div className="visio-public">
      <header style={{ borderBottom: "1px solid var(--pub-rule)", padding: "18px 20px", textAlign: "center" }}>
        <Link href="/" className="visio-masthead" style={{ fontSize: 40, textDecoration: "none", color: "var(--pub-ink)" }} aria-label="VISIO — דף הבית">
          <bdi lang="en" dir="ltr">VISIO</bdi>
        </Link>
      </header>
      <main className="visio-legal">{children}</main>
      <footer className="visio-footer">
        <div className="visio-footer-links">
          <Link href="/">דף הבית</Link>
          <a href="/?page=charter">תנאי השירות</a>
          <Link href="/privacy">מדיניות פרטיות</Link>
          <Link href="/accessibility">הצהרת נגישות</Link>
        </div>
        <p className="visio-footer-legal">© {new Date().getFullYear()} <bdi lang="en" dir="ltr">VISIO Photography</bdi> · יונתן בוזגלו, עוסק מורשה 206586869</p>
      </footer>
    </div>
  );
}
