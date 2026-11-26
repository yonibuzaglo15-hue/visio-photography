import LegalPage from "@/src/legal/LegalPage";
import { BUSINESS } from "@/src/legal/terms";

export const metadata = {
  title: "תקנון מבצע מתווכים · VISIO Photography",
  description: "תקנון מבצע המתווכים של VISIO, בנפרד ממחירון האתר",
};

export default function BrokerOfferPage() {
  return (
    <LegalPage kicker="BROKERS" title="תקנון מבצע מתווכים">
      <p>מבצע המתווכים הוא מבצע נפרד ואינו חלק ממחירון האתר.</p>
      <p>חבילת תמונות וסרטון: ₪400 + מע״מ.</p>
      <p>המבצע בתוקף להזמנות עד 30.11.2026 בשעה 23:59.</p>
      <p>חודש ראשון חינם, מהחודש השני ₪50 + מע״מ, רק באישור מפורש שלך, ללא חידוש אוטומטי.</p>
      <p>
        ביטול בכל עת בוואטסאפ{" "}
        <a href={BUSINESS.whatsapp}>{BUSINESS.phone}</a>
        {" "}או בדואר{" "}
        <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
      </p>
    </LegalPage>
  );
}
