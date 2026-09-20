"use client";

import { Suspense, useEffect } from "react";
import { signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Shield, Loader2 } from "lucide-react";
import { ADMIN, glassPanel } from "@/src/admin/theme.js";

const ERROR_HEB = {
  AccessDenied: "החשבון שלך לא מורשה לגישה. פנה למנהל המערכת.",
  NotAllowed: "החשבון שלך לא ברשימת ההרשאות.",
  OAuthAccountNotLinked: "שגיאת קישור חשבון Google.",
  Configuration: "הגדרות OAuth חסרות בשרת — בדוק משתני סביבה.",
  Default: "ההתחברות נכשלה. נסה שוב.",
};

function LoginInner() {
  const params = useSearchParams();
  const errorKey = params.get("error");
  // Ignore deep callbackUrls (stale /admin/property/... caused post-login 404s).
  const callbackUrl = "/admin";
  const err =
    errorKey && (ERROR_HEB[errorKey] || ERROR_HEB.Default);

  useEffect(() => {
    if (errorKey === "NotAllowed" || errorKey === "AccessDenied") {
      signOut({ redirect: false });
    }
  }, [errorKey]);

  return (
    <div className="visio-admin-login-wrap">
      <div className="visio-admin-login-card" style={glassPanel}>
        <div className="visio-admin-login-header">
          <Shield size={28} color={ADMIN.gold} strokeWidth={1.25} />
          <div
            style={{
              fontFamily: ADMIN.fontDisplay,
              fontSize: 28,
              letterSpacing: 4,
              color: ADMIN.gold,
              marginTop: 12,
            }}
          >
            VISIO ADMIN
          </div>
          <div style={{ fontSize: 12, color: ADMIN.muted, marginTop: 6 }}>
            התחברות Google · חשבונות מורשים בלבד
          </div>
        </div>

        <div style={{ padding: "28px 28px 32px" }}>
          {err && <div className="visio-admin-error">{err}</div>}
          <button
            type="button"
            className="visio-admin-btn-google"
            onClick={() => signIn("google", { callbackUrl })}
            style={{ width: "100%" }}
          >
            המשך עם Google
          </button>
          <p
            style={{
              marginTop: 16,
              fontSize: 11,
              color: ADMIN.muted,
              textAlign: "center",
              lineHeight: 1.7,
            }}
          >
            אין סיסמה מקומית ואין הזנת אימייל ידנית — רק OAuth אמיתי של Google.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: ADMIN.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Loader2 size={28} color={ADMIN.gold} className="visio-spin" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
