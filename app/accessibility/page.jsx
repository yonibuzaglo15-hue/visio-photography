import LegalPage from "@/src/legal/LegalPage";
import { BUSINESS } from "@/src/legal/terms";

export const metadata = {
  title: "הצהרת נגישות · VISIO Photography",
  description: "הצהרת הנגישות של VISIO Photography",
};

export default function AccessibilityPage() {
  return (
    <LegalPage kicker="ACCESSIBILITY" title="הצהרת נגישות">
      <p>עודכן: 15.11.2026</p>
      <p>
        VISIO שואפת להתאים את האתר לת״י 5568 ול־WCAG 2.0 ברמה AA.
      </p>
      <h2>התאמות שבוצעו</h2>
      <ul>
        <li>האתר בעברית, בכיוון מימין לשמאל.</li>
        <li>טקסט חלופי לרוב התמונות.</li>
        <li>סימון מיקוד במקלדת, ותמיכה בהפחתת תנועה.</li>
        <li>יומן ההזמנה ושדות הטופס ניתנים להפעלה במקלדת, עם שמות לשדות.</li>
      </ul>
      <h2>ליקויים ידועים</h2>
      <p>
        הסיורים הווירטואליים ב־360 מעלות ותכני Matterport חיצוניים אינם חלופה מלאה לקורא מסך.
        בכל עמוד סיור יש קישור לגלריית התמונות באתר. מועד התיקון של הצופה עצמו לא נקבע.
      </p>
      <h2>רכז הנגישות</h2>
      <p>
        {BUSINESS.name}, {BUSINESS.phone}, {BUSINESS.email}.
      </p>
      <p>
        פנייה על היעדר נגישות: בטלפון, בוואטסאפ {BUSINESS.phone}, או בדואר אלקטרוני {BUSINESS.email}.
      </p>
      <h2>שירות חלופי</h2>
      <p>
        אפשר לקבל את השירות בטלפון ובוואטסאפ, בלי להשתמש באתר.
      </p>
      <p>
        <a href={BUSINESS.whatsapp}>וואטסאפ</a>
        {" · "}
        <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
      </p>
    </LegalPage>
  );
}
