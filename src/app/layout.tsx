import type { Metadata } from "next";
import { Barlow_Condensed } from "next/font/google";
import localFont from "next/font/local";
import "overlayscrollbars/overlayscrollbars.css";

import "./globals.css";
import { TelemetryLoader } from "@/components/telemetry/TelemetryLoader";

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

export const metadata: Metadata = {
  title: "可露希尔基建终端",
  description: "导入干员数据，生成三班排班并导出到 MAA。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${technicalFont.variable} ${numberFont.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        {children}
        <TelemetryLoader />
      </body>
    </html>
  );
}
