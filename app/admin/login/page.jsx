import { Suspense } from "react";
import LoginClient from "./LoginClient.jsx";

export const dynamic = "force-dynamic";

const ERROR_HEB = {
  AccessDenied: "החשבון שלך לא מורשה לגישה. פנה למנהל המערכת.",
  NotAllowed: "החשבון שלך לא ברשימת ההרשאות.",
  OAuthAccountNotLinked: "שגיאת קישור חשבון Google.",
  Configuration: "הגדרות OAuth חסרות בשרת — בדוק משתני סביבה.",
  Default: "ההתחברות נכשלה. נסה שוב.",
};

export default function AdminLoginPage({ searchParams }) {
  const errorKey = searchParams?.error || null;
  const initialError =
    errorKey && (ERROR_HEB[errorKey] || ERROR_HEB.Default);

  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#050505" }} />}>
      <LoginClient initialError={initialError} errorKey={errorKey} />
    </Suspense>
  );
}
