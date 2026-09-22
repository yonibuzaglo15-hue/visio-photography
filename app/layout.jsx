import Script from "next/script";
import "./globals.css";
import { THEME_BOOTSTRAP_SCRIPT } from "../src/theme/bootstrap.js";

export const metadata = {
  title: "VISIO Photography",
  description: "צילום נדל״ן מקצועי · VISIO Photography",
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
        {children}
      </body>
    </html>
  );
}
