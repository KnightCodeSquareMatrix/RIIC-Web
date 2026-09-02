"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { Search, X } from "lucide-react";

import { filterOperators, ROOM_SKILL_TAGS, type BuildingRoomPrefix } from "@/building-rooms";
import { SkillTagBar } from "@/components/skill-query/SkillTagBar";
import { SkillResultRow } from "@/components/skill-query/SkillResultRow";
import { SkillRoomTagBar } from "@/components/skill-query/SkillRoomTagBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadMore } from "@/components/ui/load-more";
import { BUILDING_SKILL_CATALOG, OPERATOR_CATALOG } from "@/operatorPortraits";
import { useLanguageDemo } from "@/language-demo";

export const SKILL_QUERY_PAGE_SIZE = 10;

export function SkillQuery() {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [selectedRoom, setSelectedRoom] = useState<BuildingRoomPrefix | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(SKILL_QUERY_PAGE_SIZE);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const availableTags = selectedRoom ? ROOM_SKILL_TAGS[selectedRoom] : [];
  const filtered = useMemo(
    () => filterOperators(
      OPERATOR_CATALOG,
      selectedRoom,
      selectedTag,
      query,
      (skillId) => BUILDING_SKILL_CATALOG[skillId],
    ),
    [query, selectedRoom, selectedTag],
  );
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const loadMore = useCallback(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const nextCount = Math.min(visibleCount + SKILL_QUERY_PAGE_SIZE, filtered.length);
    setVisibleCount(nextCount);
    return nextCount < filtered.length;
  }, [filtered.length, visibleCount]);

  function handleRoomChange(next: BuildingRoomPrefix | null) {
    setSelectedRoom(next);
    // 标签是房间的二级维度：切换房间时清空旧标签。
    setSelectedTag(null);
    setVisibleCount(SKILL_QUERY_PAGE_SIZE);
  }

  function handleTagChange(next: string | null) {
    setSelectedTag(next);
    setVisibleCount(SKILL_QUERY_PAGE_SIZE);
  }

  function handleClearFilters() {
    setSelectedRoom(null);
    setSelectedTag(null);
    setVisibleCount(SKILL_QUERY_PAGE_SIZE);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setVisibleCount(SKILL_QUERY_PAGE_SIZE);
  }

  function handleClearQuery() {
    handleQueryChange("");
    // 清空后把焦点还给输入框，方便直接继续输入
    searchInputRef.current?.focus();
  }

  return (
    <section className="min-w-0 pt-5" aria-label={en ? "Skill Search" : "技能查询"} data-skill-query-page>
      <div className="mb-2 flex min-w-0 items-center gap-2.5">
        <span className="h-7 w-1.5 shrink-0 bg-[#FFD501]" aria-hidden="true" />
        <h1 className="truncate text-[21px] font-medium leading-none">{en ? "Skill Search" : "技能查询"}</h1>
        <span className="font-number text-xs text-muted-foreground">{filtered.length} {en ? "operators" : "名干员"}</span>
      </div>

      <div className="mt-3">
        <SkillRoomTagBar selected={selectedRoom} onChange={handleRoomChange} />
      </div>

      {selectedRoom ? (
        <SkillTagBar tags={availableTags} selected={selectedTag} onChange={handleTagChange} />
      ) : null}

      <div className="mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedRoom && !selectedTag}
          onClick={handleClearFilters}
          aria-label={en ? "Clear filters" : "清除选择"}
        >
          <X aria-hidden="true" />
          {en ? "Clear filters" : "清除选择"}
        </Button>
      </div>

      <label className="relative mt-3 block">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={searchInputRef}
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          className="h-11 pr-10 pl-9 max-sm:pr-12"
          placeholder={en ? "Search operator, skill name, or effect" : "搜索干员名称/技能名称/技能效果"}
          aria-label={en ? "Search operator, skill name, or effect" : "搜索干员名称/技能名称/技能效果"}
        />
        {query ? (
          <button
            type="button"
            onClick={handleClearQuery}
            className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFD800] max-sm:size-11"
            aria-label={en ? "Clear search" : "清空搜索"}
            title={en ? "Clear search" : "清空搜索"}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </label>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{en ? "No operators match these filters." : "没有符合筛选条件的干员。"}</p>
        ) : (
          <>
            <div className="grid gap-3">
              {visible.map((operator, index) => (
                <motion.div key={operator.id} initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.24, delay: shouldReduceMotion ? 0 : Math.min(index % SKILL_QUERY_PAGE_SIZE, 4) * 0.025 }}>
                  <SkillResultRow operator={operator} />
                </motion.div>
              ))}
            </div>
            <LoadMore
              key={`${query}:${selectedRoom ?? ""}:${selectedTag ?? ""}`}
              hasMore={hasMore}
              onLoad={loadMore}
              className="mt-4 border-t border-border/60 pt-2"
              labels={en ? { idle: "Load more", loading: "Loading", error: "Load failed — retry", end: "All results shown" } : undefined}
            />
          </>
        )}
      </div>
    </section>
  );
}
