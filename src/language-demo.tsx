"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { EnglishCatalog } from "./language-demo-data";

export type DemoLocale = "zh" | "en";

const STORAGE_KEY = "infra-demo-locale";
const DEFAULT_LOCALE: DemoLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE === "en" ? "en" : "zh";
let englishCatalog: EnglishCatalog | null = null;
let englishCatalogRequest: Promise<EnglishCatalog> | null = null;

function loadEnglishCatalog() {
  if (englishCatalog) return Promise.resolve(englishCatalog);
  englishCatalogRequest ??= import("./language-demo-data").then(({ ENGLISH_CATALOG }) => {
    englishCatalog = ENGLISH_CATALOG;
    return englishCatalog;
  });
  return englishCatalogRequest;
}

const LanguageDemoContext = createContext<{
  locale: DemoLocale;
  setLocale: (locale: DemoLocale) => void;
} | null>(null);

export function LanguageDemoProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<DemoLocale>(DEFAULT_LOCALE);
  const [, setEnglishSkillVersion] = useState(0);

  useEffect(() => {
    try {
      const storedLocale = window.localStorage.getItem(STORAGE_KEY);
      if (storedLocale === "zh" || storedLocale === "en") setLocaleState(storedLocale);
    } catch { /* Demo 仍可在当前会话切换。 */ }
  }, []);

  useEffect(() => {
    const en = locale === "en";
    document.documentElement.lang = en ? "en" : "zh-CN";
    document.title = en ? "Closure Infrastructure Terminal" : "可露希尔基建终端";
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = en
      ? "Import operator data, generate multi-shift infrastructure schedules, and export to MAA."
      : "导入干员数据，生成三班排班并导出到 MAA。";
  }, [locale]);

  useEffect(() => {
    if (locale !== "en" || englishCatalog) return;
    let active = true;
    void loadEnglishCatalog().then(() => {
      if (active) setEnglishSkillVersion((version) => version + 1);
    });
    return () => { active = false; };
  }, [locale]);

  function setLocale(nextLocale: DemoLocale) {
    setLocaleState(nextLocale);
    try { window.localStorage.setItem(STORAGE_KEY, nextLocale); } catch { /* 当前会话仍有效。 */ }
  }

  return <LanguageDemoContext.Provider value={{ locale, setLocale }}>{children}</LanguageDemoContext.Provider>;
}

export function useLanguageDemo() {
  const context = useContext(LanguageDemoContext);
  if (!context) throw new Error("useLanguageDemo must be used inside LanguageDemoProvider");
  return context;
}

export function demoRoomTitle(title: string, group: string, locale: DemoLocale) {
  if (locale !== "en") return title;
  const label = englishCatalog?.roomLabels[group];
  if (!label) return title;
  const index = title.match(/\d+\s*$/)?.[0]?.trim();
  return index ? `${label} ${index}` : label;
}

export function demoOperatorName(name: string, locale: DemoLocale) {
  if (locale !== "en") return name;
  return englishCatalog?.operatorNames[name] ?? name;
}

export function demoBuildingSkill<T extends { name: string; description: string; descriptionRich?: string }>(id: string, locale: DemoLocale, fallback: T): T {
  if (locale !== "en") return fallback;
  const translated = englishCatalog?.buildingSkills[id];
  return translated
    ? { ...fallback, name: translated.name, description: translated.description, descriptionRich: translated.description } as T
    : englishCatalog
      ? { ...fallback, name: "Infrastructure Skill", description: "English data is not available yet.", descriptionRich: "English data is not available yet." } as T
      : fallback;
}

export function LanguageDemoSwitch() {
  const { locale, setLocale } = useLanguageDemo();
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-border bg-background p-0.5 text-xs font-medium shadow-xs" aria-label="Language / 语言">
      {(["zh", "en"] as const).map((value) => (
        <button
          key={value}
          type="button"
          className={`min-h-8 min-w-11 rounded-md px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${locale === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          aria-pressed={locale === value}
          onClick={() => setLocale(value)}
        >
          {value === "zh" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}
