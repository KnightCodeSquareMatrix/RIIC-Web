import type { Metadata } from "next";
import { Barlow_Condensed } from "next/font/google";
import localFont from "next/font/local";
import "overlayscrollbars/overlayscrollbars.css";

import "./globals.css";
import { TelemetryLoader } from "@/components/telemetry/TelemetryLoader";
import { LocaleProvider } from "@/i18n/client";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

const technicalFont = Barlow_Condensed({
  variable: "--font-technical-source",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  fallback: ["Arial Narrow", "sans-serif"],
});

const numberFont = localFont({
  src: "./fonts/Bender-Bold.otf",
  variable: "--font-number-source",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "unicode-range", value: "U+0025, U+002B, U+002C-003A, U+2212" },
  ],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    title: t("siteTitle"),
    description: t("description"),
    other: {
      "riic-build-id": process.env.APP_CLIENT_BUILD_ID ?? "local-development",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      className={`${technicalFont.variable} ${numberFont.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider><LocaleProvider>{children}</LocaleProvider></NextIntlClientProvider>
        <TelemetryLoader />
      </body>
    </html>
  );
}
