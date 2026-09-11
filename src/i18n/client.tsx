"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import { isAppLocale, LEGACY_LOCALE_STORAGE, LOCALE_COOKIE, type AppLocale } from "./config";
import { DEFAULT_USER_SETTINGS, loadUserSettings } from "@/user-settings";

function saveLocale(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const sourceMessages = useMessages();
  const messages = { ...sourceMessages };
  const router = useRouter();
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    const cookie = document.cookie.split("; ").find((item) => item.startsWith(`${LOCALE_COOKIE}=`))?.split("=")[1];
    if (isAppLocale(cookie)) return;
    try {
      const legacy = localStorage.getItem(LEGACY_LOCALE_STORAGE);
      if (isAppLocale(legacy)) {
        saveLocale(legacy);
        localStorage.removeItem(LEGACY_LOCALE_STORAGE);
        if (legacy !== locale) router.refresh();
      }
    } catch { /* Storage can be disabled; the server locale remains usable. */ }
  }, [locale, router]);
  return <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Shanghai">{children}</NextIntlClientProvider>;
}

export function LanguageSwitch() {
  const locale = useLocale();
  const t = useTranslations("Common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [englishEnabled, setEnglishEnabled] = useState(DEFAULT_USER_SETTINGS.loadEnglishResources);
  useEffect(() => setEnglishEnabled(loadUserSettings(window.localStorage).loadEnglishResources), []);
  return (
    <div className="inline-flex h-7 items-center rounded-[4px] border border-border bg-background p-0.5 text-[11px] font-medium" aria-label={t("language")} aria-busy={pending}>
      {(["zh", "en"] as const).map((value) => (
        <button key={value} type="button" disabled={pending || (value === "en" && !englishEnabled)} aria-pressed={locale === value}
          className={`h-6 min-w-9 rounded-[3px] px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${locale === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          onClick={() => {
            if (value === locale) return;
            saveLocale(value);
            startTransition(() => router.refresh());
          }}
        >{value === "zh" ? "中文" : englishEnabled ? "EN" : "EN（关闭）"}</button>
      ))}
    </div>
  );
}
