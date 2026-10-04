import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "سكرتير — مساعدك الشخصي الذكي",
  description:
    "سكرتير: مساعد شخصي ذكي بالمصري — مهام، مواعيد، مشاريع، فلوس، وتنظيم يومك كلها بكلمة واحدة.",
  keywords: ["سكرتير", "مساعد ذكي", "مهام", "مصاريف", "AI assistant"],
  icons: {
    icon: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f5f5f4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-stone-50 text-stone-900 font-cairo">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
