"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LoadMore } from "@/components/ui/load-more";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { demoOperatorName, useLanguageDemo } from "@/language-demo";
import { PROFESSION_LABELS, PROFESSION_LABELS_ENGLISH } from "@/operator-presentation";
import { cn } from "@/lib/utils";

export const OPERATOR_PAGE_SIZE = 48;
const PROFESSIONS = [8, 1, 3, 2, 6, 4, 5, 7];

/** Shared presentation only: callers own the edit/single-select interaction. */
export function OperatorIdentity({ name, portrait, compact = false, children }: {
  name: string; portrait?: string; compact?: boolean; children: ReactNode;
}) {
  const { locale } = useLanguageDemo();
  const displayName = demoOperatorName(name, locale);
  return <>
    <span className={cn("shrink-0 overflow-hidden border border-border bg-muted", compact ? "size-10" : "size-12 sm:size-14")}>
      {portrait ? <img src={portrait} alt={locale === "en" ? `${displayName} portrait` : `${displayName}头像`} className="size-full object-cover" loading="lazy" decoding="async" /> : null}
    </span>
    <span className="min-w-0">
      <span className="block truncate text-sm font-semibold">{displayName}</span>
      <span className={cn("flex min-w-0 flex-wrap items-center gap-1", compact ? "mt-0.5" : "mt-1")}>{children}</span>
    </span>
  </>;
}

export function OperatorSearch({ value, onChange, compact = false }: { value: string; onChange: (value: string) => void; compact?: boolean }) {
  const { locale } = useLanguageDemo();
  const label = locale === "en" ? "Search operator" : "搜索干员";
  return <label className="relative min-w-0">
    <Search className={cn("pointer-events-none absolute left-3 size-4 text-muted-foreground", compact ? "top-2.5 max-sm:top-3.5" : "top-3.5")} aria-hidden="true" />
    <Input value={value} onChange={(event) => onChange(event.target.value)} className={cn("pl-9", compact ? "h-9 max-sm:h-11" : "h-11")} placeholder={label} aria-label={label} />
  </label>;
}

type FilterProps = { value: string; onChange: (value: string) => void; disabled?: boolean };
export function OperatorRarityFilter({ value, onChange, disabled, rarities = [6,5,4,3,2,1] }: FilterProps & { rarities?: readonly number[] }) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  return <Tabs className="min-w-0 shrink-0" value={value} onValueChange={onChange}>
    <TabsList aria-label={en ? "Filter by rarity" : "星级筛选"} className="max-w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TabsTrigger value="all" disabled={disabled}>{en ? "All" : "全部"}</TabsTrigger>
      {rarities.map((rarity) => <TabsTrigger key={rarity} value={String(rarity)} className="font-number" aria-label={en ? `${rarity}-star operators` : `${rarity} 星干员`} disabled={disabled}>{rarity}★</TabsTrigger>)}
    </TabsList>
  </Tabs>;
}

export function OperatorProfessionFilter({ value, onChange, disabled }: FilterProps) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  return <Tabs className="min-w-0 shrink-0" value={value} onValueChange={onChange}>
    <TabsList aria-label={en ? "Filter by profession" : "职业筛选"}>
      <TabsTrigger value="all" disabled={disabled}>{en ? "All" : "全部"}</TabsTrigger>
      {PROFESSIONS.map((profession) => <TabsTrigger key={profession} value={String(profession)} disabled={disabled}>{(en ? PROFESSION_LABELS_ENGLISH : PROFESSION_LABELS)[profession]}</TabsTrigger>)}
    </TabsList>
  </Tabs>;
}

export function OperatorRosterGrid({ children, compact = false, hasMore, onLoadMore }: { children: ReactNode; compact?: boolean; hasMore: boolean; onLoadMore: () => void }) {
  const { locale } = useLanguageDemo();
  return <>
    <div className={cn("grid md:grid-cols-2", compact ? "gap-2" : "gap-3")}>{children}</div>
    <LoadMore auto={false} className={compact ? "min-h-9" : undefined} hasMore={hasMore} onLoad={() => { onLoadMore(); return true; }} labels={locale === "en" ? {
      idle: "Show more operators", loading: "Loading", error: "Failed, try again", end: "All matching operators shown",
    } : { idle: "显示更多干员", loading: "正在加载", error: "加载失败，点击重试", end: "已显示全部符合条件的干员" }} />
  </>;
}
