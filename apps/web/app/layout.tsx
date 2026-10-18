import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "יועץ הרכב של שטראוס",
  description: "מה יקרה לנטו שלי אם אחליף רכב, אעבור לחשמלי או אוותר על הרכב?",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
