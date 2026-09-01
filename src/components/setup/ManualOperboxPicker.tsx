"use client";

import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { Check, RotateCcw, Search, UsersRound } from "lucide-react";

import fullOperboxJson from "../../../fixtures/operbox_full_e2.json" with { type: "json" };
import operatorCatalogJson from "../../generated/arkntools/operator-catalog.json" with { type: "json" };
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadMore } from "@/components/ui/load-more";
import { demoOperatorName, useLanguageDemo, type DemoLocale } from "@/language-demo";
import { cn } from "@/lib/utils";
import {
  buildManualOperbox,
  manualStageForEntry,
  maxEliteForRarity,
  type ManualOperboxStage,
} from "@/manual-operbox";
import type { OperBoxEntry } from "@/types";

const PAGE_SIZE = 48;

type CatalogOperator = {
  id: string;
  order: number;
  portrait: string;
};

type ManualRosterOperator = OperBoxEntry & {
  order: number;
  portrait: string;
};

const CATALOG_BY_ID = new Map(
  (operatorCatalogJson as CatalogOperator[]).map((operator) => [operator.id, operator]),
);

const MANUAL_ROSTER: ManualRosterOperator[] = (fullOperboxJson as OperBoxEntry[])
  .map((operator) => ({
    ...operator,
    order: CATALOG_BY_ID.get(operator.id)?.order ?? 0,
    portrait: CATALOG_BY_ID.get(operator.id)?.portrait ?? "",
  }))
  .sort((left, right) => right.rarity - left.rarity || right.order - left.order || left.name.localeCompare(right.name, "zh-CN"));

const STAGES: ManualOperboxStage[] = ["none", "e0", "e1", "e2"];

function initialStages(operbox: OperBoxEntry[] | null): Record<string, ManualOperboxStage> {
  const byId = new Map(operbox?.map((entry) => [entry.id, entry]) ?? []);
  const byName = new Map(operbox?.map((entry) => [entry.name, entry]) ?? []);
  return Object.fromEntries(
    MANUAL_ROSTER.map((operator) => [operator.id, manualStageForEntry(byId.get(operator.id) ?? byName.get(operator.name))]),
  );
}

function stageLabel(stage: ManualOperboxStage, locale: DemoLocale): string {
  const en = locale === "en";
  if (stage === "none") return en ? "Unowned" : "未拥有";
  if (stage === "e0") return en ? "E0" : "精0";
  if (stage === "e1") return en ? "E1" : "精1";
  return en ? "E2" : "精2";
}

const ManualOperatorCard = memo(function ManualOperatorCard({
  operator,
  stage,
  locale,
  onStageChange,
}: {
  operator: ManualRosterOperator;
  stage: ManualOperboxStage;
  locale: DemoLocale;
  onStageChange: (id: string, stage: ManualOperboxStage) => void;
}) {
  const en = locale === "en";
  const displayName = demoOperatorName(operator.name, locale);
  const maxElite = maxEliteForRarity(operator.rarity);

  return (
    <article className="grid gap-3 rounded-[4px] border border-border/80 bg-background p-3 [content-visibility:auto] [contain-intrinsic-size:8.5rem]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-12 shrink-0 overflow-hidden border border-border bg-muted sm:size-14">
          {operator.portrait ? (
            <img
              src={operator.portrait}
              alt={en ? `${displayName} portrait` : `${displayName}头像`}
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <h5 className="truncate text-sm font-semibold">{displayName}</h5>
          <p className="font-number mt-1 text-xs text-muted-foreground">
            {operator.rarity}★ · {en ? `Up to E${maxElite}` : `最高精${maxElite}`}
          </p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={en ? `${displayName} ownership and elite stage` : `${displayName}持有与精英阶段`}
        className="grid grid-cols-4 gap-1.5"
      >
        {STAGES.map((option) => {
          const requestedElite = option === "e2" ? 2 : option === "e1" ? 1 : 0;
          const disabled = option !== "none" && requestedElite > maxElite;
          const selected = stage === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={disabled
                ? (en ? `${stageLabel(option, locale)} is unavailable for ${operator.rarity}-star operators` : `${operator.rarity} 星干员无法选择${stageLabel(option, locale)}`)
                : stageLabel(option, locale)}
              title={disabled ? (en ? `Unavailable for ${operator.rarity}-star operators` : `${operator.rarity} 星干员无法达到此阶段`) : undefined}
              disabled={disabled}
              onClick={() => onStageChange(operator.id, option)}
              className={cn(
                "relative min-h-11 rounded-[4px] border px-1 text-xs font-medium outline-none transition-[background-color,border-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-[#FFD501] focus-visible:ring-offset-2",
                selected && option === "none" && "border-foreground bg-foreground text-background",
                selected && option !== "none" && "border-[#d2b000] bg-[#FFD501] text-black shadow-sm",
                !selected && !disabled && "border-border bg-background text-muted-foreground hover:border-foreground/45 hover:bg-muted/60 hover:text-foreground",
                disabled && "cursor-not-allowed border-border/50 bg-muted/30 text-muted-foreground/40",
              )}
            >
              <span className="inline-flex items-center justify-center gap-1">
                {selected ? <Check className="size-3" aria-hidden="true" /> : null}
                {stageLabel(option, locale)}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
});

export function ManualOperboxPicker({
  operbox,
  onApply,
}: {
  operbox: OperBoxEntry[] | null;
  onApply: (entries: OperBoxEntry[]) => void;
}) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [query, setQuery] = useState("");
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [stages, setStages] = useState<Record<string, ManualOperboxStage>>(() => initialStages(operbox));
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase(locale === "en" ? "en-US" : "zh-CN"));

  const handleStageChange = useCallback((id: string, stage: ManualOperboxStage) => {
    setStages((current) => ({ ...current, [id]: stage }));
  }, []);

  const summary = useMemo(() => {
    const result = { none: 0, e0: 0, e1: 0, e2: 0 };
    for (const operator of MANUAL_ROSTER) result[stages[operator.id] ?? "none"] += 1;
    return result;
  }, [stages]);
  const ownedCount = summary.e0 + summary.e1 + summary.e2;

  const filteredOperators = useMemo(() => MANUAL_ROSTER.filter((operator) => {
    const stage = stages[operator.id] ?? "none";
    if (onlyOwned && stage === "none") return false;
    if (!deferredQuery) return true;
    const displayName = demoOperatorName(operator.name, locale).toLocaleLowerCase(locale === "en" ? "en-US" : "zh-CN");
    return operator.name.toLocaleLowerCase("zh-CN").includes(deferredQuery)
      || displayName.includes(deferredQuery)
      || operator.id.toLocaleLowerCase("en-US").includes(deferredQuery);
  }), [deferredQuery, locale, onlyOwned, stages]);

  function resetListView() {
    setVisibleLimit(PAGE_SIZE);
  }

  function applySelection() {
    if (!ownedCount) return;
    onApply(buildManualOperbox(MANUAL_ROSTER, stages));
  }

  return (
    <div className="grid gap-4" data-manual-operbox-picker>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="size-4" />{en ? "Build your operator Box" : "手动选择干员 Box"}</h4>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {en
              ? "Choose ownership and elite stage. Levels use each stage cap so level-gated infrastructure skills remain available."
              : "选择持有状态与精英阶段；等级按该阶段上限估算，避免漏掉有等级要求的基建技能。"}
          </p>
        </div>
        <Button type="button" className="min-h-11 shrink-0" disabled={!ownedCount} onClick={applySelection}>
          <Check />{en ? "Use this Box" : "使用这份 Box"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" aria-live="polite">
        <strong className="font-number text-foreground">{en ? `${ownedCount} owned` : `已拥有 ${ownedCount} 名`}</strong>
        <span className="font-number text-muted-foreground">{en ? `E0 ${summary.e0} · E1 ${summary.e1} · E2 ${summary.e2}` : `精0 ${summary.e0} · 精1 ${summary.e1} · 精2 ${summary.e2}`}</span>
        <span className="font-number text-muted-foreground">{en ? `${summary.none} unowned` : `未拥有 ${summary.none} 名`}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetListView();
            }}
            className="h-11 pl-9"
            placeholder={en ? "Search operator" : "搜索干员"}
            aria-label={en ? "Search operator" : "搜索干员"}
          />
        </label>
        <Button
          type="button"
          variant={onlyOwned ? "default" : "outline"}
          className="min-h-11"
          aria-pressed={onlyOwned}
          onClick={() => {
            setOnlyOwned((current) => !current);
            resetListView();
          }}
        >
          {en ? "Owned only" : "只看已拥有"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={!ownedCount}
          onClick={() => {
            setStages(Object.fromEntries(MANUAL_ROSTER.map((operator) => [operator.id, "none"])));
            setOnlyOwned(false);
            resetListView();
          }}
        >
          <RotateCcw />{en ? "Clear" : "清空选择"}
        </Button>
      </div>

      {filteredOperators.length ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {filteredOperators.slice(0, visibleLimit).map((operator) => (
              <ManualOperatorCard
                key={operator.id}
                operator={operator}
                stage={stages[operator.id] ?? "none"}
                locale={locale}
                onStageChange={handleStageChange}
              />
            ))}
          </div>
          <LoadMore
            auto={false}
            hasMore={visibleLimit < filteredOperators.length}
            onLoad={() => {
              setVisibleLimit((current) => current + PAGE_SIZE);
              return true;
            }}
            labels={en ? {
              idle: "Show more operators",
              loading: "Loading",
              error: "Failed, try again",
              end: "All matching operators shown",
            } : {
              idle: "显示更多干员",
              loading: "正在加载",
              error: "加载失败，点击重试",
              end: "已显示全部符合条件的干员",
            }}
          />
          <Button type="button" className="min-h-11 w-full" disabled={!ownedCount} onClick={applySelection}>
            <Check />{en ? `Use this Box (${ownedCount})` : `使用这份 Box（${ownedCount} 名）`}
          </Button>
        </>
      ) : (
        <div className="grid min-h-32 place-items-center border border-dashed border-border text-center text-sm text-muted-foreground">
          {onlyOwned && !ownedCount
            ? (en ? "No operators selected yet." : "还没有选择已拥有的干员。")
            : (en ? "No matching operators." : "没有符合条件的干员。")}
        </div>
      )}
    </div>
  );
}
