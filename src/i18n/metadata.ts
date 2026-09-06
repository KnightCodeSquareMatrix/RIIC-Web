import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import type messages from "../../messages/zh.json";

export async function pageMetadata(key: keyof typeof messages.Metadata): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    title: key === "home" ? t("siteTitle") : `${t(key)} · ${t("siteTitle")}`,
    description: t("description"),
  };
}
