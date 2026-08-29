"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import operatorEnglishNamesJson from "./generated/operator-english-names.json" with { type: "json" };
import buildingSkillEnglishJson from "./generated/building-skill-english.json" with { type: "json" };
import buildingSkillEnglishManualJson from "./generated/building-skill-english-manual.json" with { type: "json" };

export type DemoLocale = "zh" | "en";

const STORAGE_KEY = "infra-demo-locale";
const LanguageDemoContext = createContext<{
  locale: DemoLocale;
  setLocale: (locale: DemoLocale) => void;
} | null>(null);

export function LanguageDemoProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<DemoLocale>("zh");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "en") setLocaleState("en");
    } catch { /* Demo 仍可在当前会话切换。 */ }
  }, []);

  function setLocale(nextLocale: DemoLocale) {
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale === "en" ? "en" : "zh-CN";
    try { window.localStorage.setItem(STORAGE_KEY, nextLocale); } catch { /* 当前会话仍有效。 */ }
  }

  return <LanguageDemoContext.Provider value={{ locale, setLocale }}>{children}</LanguageDemoContext.Provider>;
}

export function useLanguageDemo() {
  const context = useContext(LanguageDemoContext);
  if (!context) throw new Error("useLanguageDemo must be used inside LanguageDemoProvider");
  return context;
}

const ENGLISH_ROOM_LABELS: Record<string, string> = {
  control: "Control Center",
  trading: "Trading Post",
  manufacture: "Factory",
  power: "Power Plant",
  dormitory: "Dormitory",
  meeting: "Reception Room",
  hire: "Office",
  processing: "Workshop",
  training: "Training Room",
};

export function demoRoomTitle(title: string, group: string, locale: DemoLocale) {
  if (locale !== "en") return title;
  const label = ENGLISH_ROOM_LABELS[group];
  if (!label) return title;
  const index = title.match(/\d+\s*$/)?.[0]?.trim();
  return index ? `${label} ${index}` : label;
}

const OPERATOR_ENGLISH_NAMES = operatorEnglishNamesJson as Record<string, string>;
const OPERATOR_ENGLISH_FALLBACKS: Record<string, string> = {
  "予愿安洁莉娜": "Angelina the Wishful", "焰狐龙梓兰": "Flaming Espinas Orchid", "雷狼龙S空爆": "Zinogre S Catapult",
  "怒潮凛冬": "Raging Tide Zima", "凯尔希·思衡托": "Kal'tsit Sincero", "罗德岛隐秘队": "Rhodes Island Covert Team",
  "伯塔尼": "Botany", "乌啾": "Ujou", "裂响": "Tanya", "维伊": "Veen", "GALLUS²": "GALLUS²", "可露希尔": "Closure",
  "谬因": "Aphris", "机械师": "McNist", "佩德洛": "Pedro", "珊比": "Thumpy", "时隙": "Timeslot", "嘉辛塔": "Jacinta",
};

export function demoOperatorName(name: string, locale: DemoLocale) {
  if (locale !== "en") return name;
  return OPERATOR_ENGLISH_NAMES[name] ?? OPERATOR_ENGLISH_FALLBACKS[name] ?? name;
}

const BUILDING_SKILL_ENGLISH = {
  ...(buildingSkillEnglishJson as Record<string, { name: string; description: string }>),
  ...(buildingSkillEnglishManualJson as Record<string, { name: string; description: string }>),
};

export function demoBuildingSkill<T extends { name: string; description: string; descriptionRich?: string }>(id: string, locale: DemoLocale, fallback: T): T {
  if (locale !== "en") return fallback;
  const translated = BUILDING_SKILL_ENGLISH[id];
  return translated
    ? { ...fallback, name: translated.name, description: translated.description, descriptionRich: translated.description } as T
    : { ...fallback, name: "Infrastructure Skill", description: "English data is not available yet.", descriptionRich: "English data is not available yet." } as T;
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
