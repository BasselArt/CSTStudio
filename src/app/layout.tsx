import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { Direction } from "radix-ui";
import "./globals.css";
import { cn } from "@/lib/utils";
import { getSettings } from "@/services/settings";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-sans",
  weight: ["400", "500", "700"],
  subsets: ["arabic", "latin"],
});

/** عنوان التبويب من هوية النظام في الإعدادات */
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: s.orgSubtitle ? `${s.orgName} — ${s.orgSubtitle}` : s.orgName,
    description: "نظام إدارة طلبات استوديو التصميم",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={cn("font-sans", plexArabic.variable)}>
      {/* Radix يفترض ltr داخليًا ما لم يُغلَّف بمزوّد الاتجاه — بدونه تنقلب مكونات Select وDropdown */}
      <body className="antialiased" suppressHydrationWarning>
        <Direction.Provider dir="rtl">{children}</Direction.Provider>
      </body>
    </html>
  );
}
