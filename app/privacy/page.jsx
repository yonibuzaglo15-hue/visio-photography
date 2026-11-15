import LegalPage from "@/src/legal/LegalPage";
import { BUSINESS } from "@/src/legal/terms";

export const metadata = {
  title: "מדיניות פרטיות · VISIO Photography",
  description: "מדיניות הפרטיות של VISIO Photography",
};

export default function PrivacyPage() {
  return (
    <LegalPage kicker="PRIVACY" title="מדיניות פרטיות">
      <h2>בעל השליטה</h2>
      <p>
        {BUSINESS.name}, VISIO, {BUSINESS.trade}, {BUSINESS.email}.
      </p>
      <h2>אילו נתונים נאספים</h2>
      <p>
        בטופס ההזמנה: שם, טלפון, כתובת נכס והערות. לוגו, מספר טלפון על התמונה ותמונת גוף של הסוכן נמסרים רק אם בוחרים בכך.
      </p>
      <h2>מטרות</h2>
      <p>תיאום, ביצוע השירות, חשבונית ותקשורת.</p>
      <h2>חובה למסור</h2>
      <p>
        אין חובה על פי דין למסור את המידע. בלי שם, טלפון וכתובת נכס לא נוכל לתאם את הצילום.
      </p>
      <h2>מי מקבל את המידע</h2>
      <p>
        הפרטים נשמרים אצל ספקי השירות שלנו: Google (יומן ודואר), Twilio (מסרים), Supabase ו־Vercel, לרבות העברה לחו״ל.
      </p>
      <h2>זכויות</h2>
      <p>
        עיון, תיקון ומחיקה בפנייה אל {BUSINESS.email}.
      </p>
      <h2>אבטחה</h2>
      <p>הגישה למידע מוגבלת למתן השירות.</p>
      <h2>localStorage</h2>
      <p>בדפדפן נשמר רק מצב התצוגה, יום או לילה. אין כלי מעקב של צד שלישי.</p>
      <p>
        פניות: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
      </p>
    </LegalPage>
  );
}
