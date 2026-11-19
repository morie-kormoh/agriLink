import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Toaster } from "@agrilink/ui/components/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgriLink Salone", template: "%s · AgriLink Salone" },
  description: "AgriLink Salone — Empowering Farmers Through Digital Finance.",
  applicationName: "AgriLink Salone",
  appleWebApp: { capable: true, title: "AgriLink", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1f2a6b",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === "kri" ? "en" : locale} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <NextIntlClientProvider>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
