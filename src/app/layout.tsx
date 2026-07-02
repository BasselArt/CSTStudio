import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  weight: ["400", "500", "700"],
  subsets: ["arabic", "latin"],
});

export const metadata: Metadata = {
  title: "استوديو التصميم — هيئة الاتصالات والفضاء والتقنية",
  description: "نظام إدارة طلبات استوديو التصميم",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${plexArabic.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
