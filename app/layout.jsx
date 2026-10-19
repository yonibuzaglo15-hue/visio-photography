import Script from "next/script";
import { Heebo, Frank_Ruhl_Libre, Bodoni_Moda, Bebas_Neue } from "next/font/google";
import "./globals.css";
import { THEME_BOOTSTRAP_SCRIPT } from "../src/theme/bootstrap.js";

// Self-hosted at build time by next/font (no runtime request to Google Fonts, no render-blocking @import).
const heebo = Heebo({ subsets: ["hebrew", "latin"], weight: ["300", "400", "500", "600"], variable: "--font-heebo", display: "swap" });
const frank = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], weight: ["400", "500", "700"], variable: "--font-frank", display: "swap" });
const bodoni = Bodoni_Moda({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-bodoni", display: "swap" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://visioisrael.com";
const DESCRIPTION = "VISIO Photography — צילום נדל״ן מקצועי: צילום נכסים, וידאו, רחפן וסיורים וירטואליים. תיאום צילום אונליין.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "VISIO Photography — צילום נדל״ן מקצועי", template: "%s" },
  description: DESCRIPTION,
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "any" }] },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: "/",
    siteName: "VISIO Photography",
    title: "VISIO Photography — צילום נדל״ן מקצועי",
    description: DESCRIPTION,
    images: [{ url: "/portfolio-featured/8/hero.jpg", width: 1920, height: 1080, alt: "VISIO Photography" }],
  },
  twitter: { card: "summary_large_image", title: "VISIO Photography — צילום נדל״ן מקצועי", description: DESCRIPTION, images: ["/portfolio-featured/8/hero.jpg"] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning className={`${heebo.variable} ${frank.variable} ${bodoni.variable} ${bebas.variable}`}>
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
