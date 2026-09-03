"use client";

import type { ReactNode } from "react";

import { useLanguageDemo } from "@/language-demo";

export function LocalizedText({ zh, en }: { zh: ReactNode; en: ReactNode }) {
  const { locale } = useLanguageDemo();
  return <>{locale === "en" ? en : zh}</>;
}
