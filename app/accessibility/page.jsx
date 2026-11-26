import LegalPage from "@/src/legal/LegalPage";
import { BUSINESS } from "@/src/legal/terms";

export const metadata = {
  title: "הצהרת נגישות · VISIO Photography",
  description: "הצהרת הנגישות של VISIO Photography לפי ת״י 5568 ו־WCAG 2.1 AA",
};

export default function AccessibilityPage() {
  return (
    <LegalPage kicker="ACCESSIBILITY" title="הצהרת נגישות">
      <p>עודכן: 26.11.2026</p>
      <p>
        VISIO שואפת להתאים את האתר לת״י 5568 ול־WCAG 2.1 ברמה AA.
      </p>
      <h2>התאמות שבוצעו</h2>
      <ul>
        <li>האתר בעברית, בכיוון מימין לשמאל, עם קישור לדילוג לתוכן.</li>
        <li>טקסט חלופי לתמונות התוכן, שמות לשדות, ומיקוד מקלדת נראה.</li>
        <li>יעדי מגע של 44 פיקסלים לפחות בתפריט, בכפתורים ובווידג׳ט הנגישות.</li>
        <li>ווידג׳ט נגישות בכל עמוד: גודל טקסט, ניגודיות, גווני אפור, הדגשת קישורים, עצירת אנימציות, גופן קריא ואיפוס.</li>
        <li>האתר מכבד בקשת מערכת להפחתת תנועה.</li>
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
      <p>אפשר לקבל את השירות בטלפון ובוואטסאפ, בלי להשתמש באתר.</p>
      <p>
        <a href={BUSINESS.whatsapp} target="_blank" rel="noopener noreferrer">וואטסאפ</a>
        {" · "}
        <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
      </p>
    </LegalPage>
  );
}
