"use client";

import { useEffect } from "react";
import { signIn, signOut } from "next-auth/react";
import { Shield } from "lucide-react";
import { ADMIN, glassPanel } from "@/src/admin/theme.js";

export default function LoginClient({ initialError, errorKey }) {
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
          {initialError && (
            <div className="visio-admin-error" role="alert" data-testid="auth-error">
              {initialError}
            </div>
          )}
          <button
            type="button"
            className="visio-admin-btn-google"
            onClick={() => signIn("google", { callbackUrl: "/admin" })}
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
