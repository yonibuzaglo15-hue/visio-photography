import LegalShell from "@/src/legal/LegalShell.jsx";

// NOTE: text from the audit draft, pending legal / accessibility-consultant review (see PR description).
export const metadata = {
  title: "הצהרת נגישות · VISIO Photography",
  description: "הצהרת הנגישות של VISIO Photography ופרטי רכז הנגישות.",
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <LegalShell>
      <h1>הצהרת נגישות</h1>
      <p className="visio-legal-meta">עודכנה לאחרונה: 19.10.2026</p>

      <p>VISIO Photography רואה חשיבות במתן שירות נגיש לכל אדם, לרבות אנשים עם מוגבלות, בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ״ח-1998, ולתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע״ג-2013.</p>

      <h2>רמת הנגישות</h2>
      <p>פעלנו להתאים את האתר לדרישות תקן ישראלי 5568 ברמה AA, המבוסס על הנחיות WCAG 2.0. האתר נבדק בכלים אוטומטיים (axe, Lighthouse) ובבדיקת ניווט במקלדת בתאריך 19.10.2026.</p>

      <h2>התאמות שבוצעו</h2>
      <ul>
        <li>שפת האתר מוגדרת כעברית, בכיוון ימין לשמאל.</li>
        <li>ניווט מלא במקלדת, כולל בחירת תאריך ושעה בטופס ההזמנה, וסימון פוקוס נראה לעין.</li>
        <li>תוויות מקושרות לכל שדות הטופס והודעות שגיאה כתובות.</li>
        <li>טקסט חלופי לתמונות.</li>
        <li>ניגודיות צבעים מספקת וגודל טקסט מינימלי קריא.</li>
        <li>מבנה כותרות היררכי בכל עמוד.</li>
        <li>התאמה למסכים בגדלים שונים, ומצב תצוגה בהיר וכהה.</li>
      </ul>

      <h2>חלקים שאינם נגישים במלואם</h2>
      <ul>
        <li>סיורים וירטואליים בתלת-מימד (Matterport ו-360°) מבוססים על תצוגה חזותית ואינם נגישים במלואם לאנשים עיוורים. לפי בקשה נשמח לספק תיאור מילולי של הנכס או תמונות עם תיאור.</li>
      </ul>

      <h2>רכז הנגישות</h2>
      <p>נתקלתם בבעיית נגישות? נשמח לשמוע ולתקן.</p>
      <ul>
        <li>שם: יונתן בוזגלו</li>
        <li>טלפון: <a href="tel:+972535376096"><bdi dir="ltr">053-537-6096</bdi></a></li>
        <li>אימייל: <a href="mailto:yoni@visioisrael.com"><bdi dir="ltr">yoni@visioisrael.com</bdi></a></li>
      </ul>

      <h2>הסדרי נגישות פיזיים</h2>
      <p>השירות ניתן בנכס של הלקוח ואין קבלת קהל במשרד.</p>
    </LegalShell>
  );
}
