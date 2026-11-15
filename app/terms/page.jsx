import fs from "node:fs";
import path from "node:path";
import LegalPage from "@/src/legal/LegalPage";
import { BUSINESS, BUSINESS_LINE, PUBLIC_TERMS } from "@/src/legal/terms";

export const metadata = {
  title: "תקנון · VISIO Photography",
  description: "תנאי השירות של VISIO Photography",
};

export default function TermsPage() {
  const pdfPath = path.join(process.cwd(), "public", "terms", "visio-terms.pdf");
  const hasPdf = fs.existsSync(pdfPath);
  const cancelHref = `${BUSINESS.whatsapp}?text=${encodeURIComponent("ביטול עסקה או מנוי")}`;

  return (
    <LegalPage kicker="TERMS" title="תקנון">
      <p className="visio-footer-business">{BUSINESS_LINE}</p>
      {PUBLIC_TERMS.map((term) => (
        <section key={term.title} className="visio-term">
          <h2 className="visio-term-title">{term.title}</h2>
          <p>{term.body}</p>
        </section>
      ))}
      <p>
        <a href={cancelHref}>ביטול עסקה או מנוי</a>
      </p>
      <p>
        <a href="/broker-offer">תקנון מבצע מתווכים</a>
      </p>
      {hasPdf ? (
        <p>
          <a href="/terms/visio-terms.pdf">הורדת התקנון</a>
        </p>
      ) : null}
    </LegalPage>
  );
}
