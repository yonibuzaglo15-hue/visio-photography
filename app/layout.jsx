import "./globals.css";

export const metadata = {
  title: "VISIO Photography",
  description: "צילום נדל״ן מקצועי · VISIO Photography",
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
