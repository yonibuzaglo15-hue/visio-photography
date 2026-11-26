import Script from "next/script";
import "../src/vendor/scrollcraft/scrollcraft.css";
import "./globals.css";
import { THEME_BOOTSTRAP_SCRIPT } from "../src/theme/bootstrap.js";
import AccessibilityWidget from "../src/site/AccessibilityWidget";
import CookieConsent from "../src/site/CookieConsent";

export const metadata = {
  title: "VISIO Photography",
  description: "צילום נדל״ן מקצועי · VISIO Photography",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <Script
          id="visio-theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
        <a className="visio-skip" href="#main">דלג לתוכן</a>
        {children}
        <AccessibilityWidget />
        <CookieConsent />
      </body>
    </html>
  );
}
