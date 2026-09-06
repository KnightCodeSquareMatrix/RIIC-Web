"use client";

import { useTranslations } from "next-intl";
import type messages from "../../messages/zh.json";

export function LocalizedText({ message }: { message: keyof typeof messages.Static }) {
  const t = useTranslations("Static");
  return <>{t(message)}</>;
}
