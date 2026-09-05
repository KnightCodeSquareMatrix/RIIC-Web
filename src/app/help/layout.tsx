"use client";

import type { ReactNode } from "react";

import { HelpBackToTop } from "@/components/help/HelpBackToTop";
import { HelpFloatingNav } from "@/components/help/HelpFloatingNav";
import { InfoPageLayout } from "@/components/layout/InfoPageLayout";
import { useLanguageDemo } from "@/language-demo";

export default function HelpLayout({ children }: { children: ReactNode }) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  return (
    <InfoPageLayout
      title={en ? "Help Center" : "使用帮助"}
      href="/help"
      contentId="help-content"
      floatingControls={<><HelpBackToTop /><HelpFloatingNav /></>}
    >
      {children}
    </InfoPageLayout>
  );
}
