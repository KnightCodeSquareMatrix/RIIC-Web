"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { EnglishCatalog } from "./language-demo-data";

export type DemoLocale = "zh" | "en";

const STORAGE_KEY = "infra-demo-locale";
const DEFAULT_LOCALE: DemoLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE === "en" ? "en" : "zh";
const ROUTE_TITLES: Record<string, { zh: string; en: string }> = {
  "/": { zh: "可露希尔基建终端", en: "Closure Infrastructure Terminal" },
  "/training": { zh: "练卡建议 · 可露希尔基建终端", en: "Training Advice · Closure Infrastructure Terminal" },
  "/skills": { zh: "技能查询 · 可露希尔基建终端", en: "Skill Reference · Closure Infrastructure Terminal" },
  "/skland": { zh: "森空岛状态 · 可露希尔基建终端", en: "Skland Status · Closure Infrastructure Terminal" },
  "/account": { zh: "账号管理 · 可露希尔基建终端", en: "Account · Closure Infrastructure Terminal" },
  "/account/reset-password": { zh: "重置密码 · 可露希尔基建终端", en: "Reset Password · Closure Infrastructure Terminal" },
  "/help": { zh: "使用帮助 · 可露希尔基建终端", en: "Help Center · Closure Infrastructure Terminal" },
  "/help/beginner": { zh: "新手教程 · 使用帮助", en: "Beginner Tutorials · Help Center" },
  "/changelog": { zh: "更新日志 · 可露希尔基建终端", en: "Changelog · Closure Infrastructure Terminal" },
  "/help/import-operators": { zh: "导入干员 Box · 使用帮助", en: "Import Operator Box · Help Center" },
  "/help/owned-operators": { zh: "核对干员数据 · 使用帮助", en: "Check Operator Data · Help Center" },
  "/about": { zh: "关于我们 · 可露希尔基建终端", en: "About · Closure Infrastructure Terminal" },
  "/terms": { zh: "服务条款 · 可露希尔基建终端", en: "Terms of Service · Closure Infrastructure Terminal" },
  "/privacy": { zh: "隐私政策 · 可露希尔基建终端", en: "Privacy Policy · Closure Infrastructure Terminal" },
  "/admin": { zh: "管理后台 · 可露希尔基建终端", en: "Administration · Closure Infrastructure Terminal" },
  "/admin/changelog": { zh: "更新日志 · 管理后台", en: "Changelog · Administration" },
  "/admin/users": { zh: "用户管理 · 管理后台", en: "Users · Administration" },
  "/admin/issues": { zh: "求解问题 · 管理后台", en: "Solver Issues · Administration" },
};
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
  const pathname = usePathname();
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
    const title = ROUTE_TITLES[pathname] ?? ROUTE_TITLES["/"];
    const expectedTitle = en ? title.en : title.zh;
    const syncTitle = () => {
      if (document.title !== expectedTitle) document.title = expectedTitle;
    };
    syncTitle();
    const titleObserver = new MutationObserver(syncTitle);
    titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = en
      ? "Import operator data, generate multi-shift infrastructure schedules, and export to MAA."
      : "导入干员数据，生成三班排班并导出到 MAA。";
    return () => titleObserver.disconnect();
  }, [locale, pathname]);

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
    <div className="inline-flex h-7 items-center rounded-[4px] border border-border bg-background p-0.5 text-[11px] font-medium" aria-label="Language / 语言">
      {(["zh", "en"] as const).map((value) => (
        <button
          key={value}
          type="button"
          className={`h-6 min-w-9 rounded-[3px] px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${locale === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          aria-pressed={locale === value}
          onClick={() => setLocale(value)}
        >
          {value === "zh" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}
