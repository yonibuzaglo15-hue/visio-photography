import { BUSINESS, BUSINESS_LINE } from "./terms.js";

export default function LegalPage({ kicker, title, children }) {
  return (
    <div className="visio-public">
      <header className="visio-legal-bar">
        <a className="visio-legal-brand" href="/">VISIO</a>
      </header>
      <main className="visio-section visio-narrow visio-legal">
        <p className="visio-kicker">{kicker}</p>
        <h1 className="visio-section-title">{title}</h1>
        {children}
      </main>
      <footer className="visio-footer">
        <a className="visio-footer-mark" href="/" aria-label="VISIO — דף הבית">VISIO</a>
        <p className="visio-footer-tag">נדל״ן. בצילום שמוכר.</p>
        <p className="visio-footer-business">{BUSINESS_LINE}</p>
        <div className="visio-footer-nav">
          <a href="/#booking">הזמן</a>
          <a href="/terms">תקנון</a>
          <a href="/privacy">מדיניות פרטיות</a>
          <a href="/accessibility">הצהרת נגישות</a>
        </div>
        <p className="visio-footer-legal">
          <a href={BUSINESS.whatsapp}>וואטסאפ {BUSINESS.phone}</a>
          {" · "}
          <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
          {" · © 2026 VISIO – "}{BUSINESS.name}{". כל הזכויות בתמונות, בסרטונים ובסיורים שמורות. אין להעתיק או להשתמש בהם ללא אישור בכתב"}
        </p>
      </footer>
    </div>
  );
}
