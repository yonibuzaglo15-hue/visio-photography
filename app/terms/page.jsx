import LegalPage from "@/src/legal/LegalPage";
import { BUSINESS_LINE, PUBLIC_TERMS } from "@/src/legal/terms";

export const metadata = {
  title: "תקנון · VISIO Photography",
  description: "תקנון ומדיניות פרטיות של VISIO Photography להורדה",
};

export default function TermsPage() {
  return (
    <LegalPage kicker="TERMS" title="תקנון">
      <p>{BUSINESS_LINE}</p>
      <p>
        זהו סיכום. הנוסח המלא של התקנון ושל מדיניות הפרטיות נמצא בקובצי ה־PDF. עו״ד פיטר יחליף אותם בנוסח הסופי.
      </p>
      <div className="visio-legal-downloads">
        <a className="visio-btn" href="/legal/terms.pdf">הורדת התקנון</a>
        <a className="visio-btn outline" href="/legal/privacy.pdf">הורדת מדיניות הפרטיות</a>
      </div>
      <ul>
        {PUBLIC_TERMS.slice(0, 4).map((term) => (
          <li key={term.title}><strong>{term.title}.</strong> {term.body}</li>
        ))}
      </ul>
      <p>
        <a href="/broker-offer">תקנון מבצע מתווכים</a>
      </p>
    </LegalPage>
  );
}
