import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Toaster } from "@agripay/ui/components/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgriPay Salone", template: "%s · AgriPay Salone" },
  description: "AgriPay Salone — Empowering Farmers Through Digital Finance.",
  applicationName: "AgriPay Salone",
  appleWebApp: { capable: true, title: "AgriPay", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#2f7d4f",
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
