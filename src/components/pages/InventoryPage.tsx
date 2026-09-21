"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, PackageOpen, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { getSklandInventory } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import itemCatalog from "@/generated/item-catalog.json";
import { useLocale } from "next-intl";
import type { DisplayError, SklandInventoryData } from "@/types";

const catalog = itemCatalog as Record<string, { name?: string; icon?: string }>;
const fmt = (value: number) => value.toLocaleString("zh-CN");
const BATTLE_RECORD_IDS = new Set(["2001", "2002", "2003", "2004"]);
const COMMON_IDS = ["4002", "4003", "4001", "4004", "4005", "7004", "7003", "7001"];
const MANUAL_RESOURCE_IDS = ["4002", "4003", "4004", "4005", "7004", "7003", "7001"];
const FEATURED_IDS = new Set([...COMMON_IDS, ...BATTLE_RECORD_IDS]);
const MANUAL_STORAGE_KEY = "aic-skland-inventory-manual-resources-v1";
const HEADHUNTING_STEPS = [
  { tier: 1, content: "寻访凭证 x1", cost: 10, pulls: 1, average: 10 },
  { tier: 2, content: "寻访凭证 x2", cost: 28, pulls: 3, average: 9.33 },
  { tier: 3, content: "寻访凭证 x5", cost: 68, pulls: 8, average: 8.5 },
  { tier: 4, content: "十连寻访凭证 x1", cost: 138, pulls: 18, average: 7.67 },
  { tier: 5, content: "十连寻访凭证 x2", cost: 258, pulls: 38, average: 6.79 },
] as const;
const SIX_STAR_E2_60_COST = { lmd: 588_000, exp: 1_092_000 };
const BATTLE_RECORD_EXP = { "2001": 200, "2002": 400, "2003": 1_000, "2004": 2_000 } as const;

export default function InventoryPage() {
  const locale = useLocale();
  const [data, setData] = useState<SklandInventoryData | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<DisplayError | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualCounts, setManualCounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getSklandInventory());
      setError(null);
    } catch (value) {
      setError(value as DisplayError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(MANUAL_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
      const next: Record<string, string> = {};
      for (const id of MANUAL_RESOURCE_IDS) {
        const value = parsed[id];
        if (typeof value === "string" && /^\d*$/.test(value)) next[id] = value;
      }
      setManualCounts(next);
    } catch {
      setManualCounts({});
    }
  }, []);

  const setManualCount = (id: string, value: string) => {
    const normalized = value.replace(/\D/g, "").slice(0, 12);
    setManualCounts((current) => {
      const next = { ...current, [id]: normalized };
      try { window.localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(next)); } catch { /* keep session value */ }
      return next;
    });
  };

  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (data?.items ?? [])
      .filter((item) => /^\d+$/.test(item.id))
      .filter((item) => !normalized || (catalog[item.id]?.name ?? "").toLocaleLowerCase().includes(normalized));
  }, [data, query]);
  const apiCountById = useMemo(() => new Map((data?.items ?? []).map((item) => [item.id, item.count])), [data]);
  const manualValue = useCallback((id: string) => {
    const raw = manualCounts[id]?.trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
  }, [manualCounts]);
  const itemCount = useCallback((id: string) => manualValue(id) ?? apiCountById.get(id) ?? 0, [apiCountById, manualValue]);
  const featuredItems = useMemo(() => {
    return [...COMMON_IDS, ...BATTLE_RECORD_IDS]
      .map((id) => ({ id, count: itemCount(id) }));
  }, [itemCount]);
  const otherItems = useMemo(() => items.filter((item) => !FEATURED_IDS.has(item.id)), [items]);
  const yellowCerts = manualValue("4004") ?? apiCountById.get("4004") ?? 0;
  const exchange = useMemo(() => {
    let selected: (typeof HEADHUNTING_STEPS)[number] | null = null;
    for (const step of HEADHUNTING_STEPS) {
      if (yellowCerts >= step.cost) selected = step;
    }
    return {
      pulls: selected?.pulls ?? 0,
      remaining: yellowCerts - (selected?.cost ?? 0),
    };
  }, [yellowCerts]);
  const pullSummary = useMemo(() => {
    const originium = itemCount("4002");
    const orundum = itemCount("4003");
    const singleTickets = itemCount("7003");
    const tenPullTickets = itemCount("7004");
    const convertedOrundum = orundum + originium * 180;
    const currencyPulls = Math.floor(convertedOrundum / 600);
    return {
      total: currencyPulls + singleTickets + tenPullTickets * 10 + exchange.pulls,
      remainingOrundum: convertedOrundum % 600,
      currencyPulls,
      ticketPulls: singleTickets + tenPullTickets * 10,
    };
  }, [exchange.pulls, itemCount]);
  const sixStarSummary = useMemo(() => {
    const lmdCount = Math.floor(itemCount("4001") / SIX_STAR_E2_60_COST.lmd);
    const exp = (Object.entries(BATTLE_RECORD_EXP) as Array<[keyof typeof BATTLE_RECORD_EXP, number]>).reduce(
      (total, [id, value]) => total + itemCount(id) * value,
      0,
    );
    return {
      count: Math.min(lmdCount, Math.floor(exp / SIX_STAR_E2_60_COST.exp)),
      exp,
      lmdCount,
      expCount: Math.floor(exp / SIX_STAR_E2_60_COST.exp),
    };
  }, [itemCount]);
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-8 pt-5 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-lg font-semibold"><span className="h-6 w-1.5 bg-[#FFD501]" aria-hidden="true" />{locale === "en" ? "Inventory" : "查看库存"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{locale === "en" ? "Read-only inventory from Skland." : "读取森空岛仓库物品，仅查看，不修改游戏数据。"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading} aria-label="刷新库存"><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />刷新</Button>
            <Link href="/" aria-label="返回基建终端" className="grid size-11 place-items-center border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ArrowLeft className="size-5" /></Link>
          </div>
        </header>

        <section className="border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2"><PackageOpen className="size-5 text-[#FFD501]" /><h2 className="text-xl font-semibold">仓库物品</h2></div>
            <span className="text-sm text-muted-foreground">共 {items.length} 项</span>
          </div>
          <div className="relative mt-5 max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物品名称" className="pl-9" aria-label="搜索库存" /></div>
          {error ? <div className="mt-5 border border-amber-400/40 bg-amber-50/10 px-4 py-3 text-sm text-amber-200">{error.message || "库存读取失败，请稍后重试。"}</div> : null}
          {!error && loading ? <div className="py-16 text-center text-sm text-muted-foreground">正在读取森空岛库存...</div> : null}
          {!error && !loading ? <>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="min-w-0">
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">基础资源</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {featuredItems.map((item) => {
                  const catalogItem = catalog[item.id];
                  return <div key={item.id} className="flex items-center gap-3 border border-border/70 bg-muted/20 px-4 py-3">
                    <div className="grid size-11 shrink-0 place-items-center border border-border/70 bg-background/60">
                      {catalogItem?.icon ? <Image src={catalogItem.icon} alt="" width={44} height={44} className="size-10 object-contain" /> : <PackageOpen className="size-5 text-muted-foreground" aria-hidden="true" />}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm">{catalogItem?.name ?? "未知物品"}</span>
                    {MANUAL_RESOURCE_IDS.includes(item.id) ? <Input
                      inputMode="numeric"
                      value={manualCounts[item.id] ?? ""}
                      onChange={(event) => setManualCount(item.id, event.target.value)}
                      placeholder={fmt(apiCountById.get(item.id) ?? 0)}
                      aria-label={`填写${catalogItem?.name ?? "资源"}数量`}
                      className="ml-2 h-9 w-24 shrink-0 text-right font-number"
                    /> : <strong className="ml-3 shrink-0 font-number text-base">{fmt(item.count)}</strong>}
                  </div>;
                })}
            </div>
              </div>
            <section className="border border-border/70 bg-muted/10 p-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">当前资源可用寻访</h3>
                <p className="mt-2 font-number text-4xl font-semibold"><span className="text-[#FFD501]">{fmt(pullSummary.total)}</span> 抽</p>
                {pullSummary.remainingOrundum > 0 ? <p className="mt-1 text-xs text-muted-foreground">另余 {fmt(pullSummary.remainingOrundum)} 合成玉</p> : null}
              </div>
              <div className="mt-4 grid gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                <p className="flex justify-between gap-3"><span>源石与合成玉</span><strong className="font-number text-foreground">{fmt(pullSummary.currencyPulls)} 抽</strong></p>
                <p className="flex justify-between gap-3"><span>寻访凭证</span><strong className="font-number text-foreground">{fmt(pullSummary.ticketPulls)} 抽</strong></p>
                <Tooltip>
                  <TooltipTrigger
                    render={<p className="flex cursor-help justify-between gap-3 border-b border-dashed border-muted-foreground/50" />}
                  >
                    <span>黄票阶梯兑换</span><strong className="font-number text-foreground">{fmt(exchange.pulls)} 抽</strong>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="w-72 p-3">
                    <p className="mb-2 text-xs font-semibold">黄票兑换规则</p>
                    <div className="grid gap-1 text-xs">
                      {HEADHUNTING_STEPS.map((step) => <p key={step.tier} className="flex justify-between gap-3">
                        <span>{step.content}</span><span className="font-number">累计 {step.cost} 黄票 · {step.pulls} 抽</span>
                      </p>)}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="mt-5 border-t border-border/70 pt-4">
                <h3 className="text-sm font-medium text-muted-foreground">六星从零到精二 60 级</h3>
                <p className="mt-2 font-number text-3xl font-semibold"><span className="text-[#FFD501]">{sixStarSummary.count.toFixed(2)}</span> 个</p>
                <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
                  <p className="flex justify-between gap-3"><span>龙门币</span><strong className="font-number text-foreground">{fmt(itemCount("4001"))} / {fmt(SIX_STAR_E2_60_COST.lmd)}</strong></p>
                  <p className="flex justify-between gap-3"><span>作战记录经验</span><strong className="font-number text-foreground">{fmt(sixStarSummary.exp)} / {fmt(SIX_STAR_E2_60_COST.exp)}</strong></p>
                </div>
                <p className="mt-3 text-[11px] leading-4 text-muted-foreground">仅考虑升级和精英化。</p>
              </div>
            </section>
            </div>
            {otherItems.length > 0 ? <section className="mt-7 border-t border-border pt-5">
              <h3 className="mb-3 text-lg font-semibold">其他库存</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {otherItems.map((item) => {
                  const catalogItem = catalog[item.id];
                  return <div key={item.id} className="flex min-h-20 items-center gap-2 border border-border/70 bg-muted/20 px-3 py-3">
                    <div className="grid size-11 shrink-0 place-items-center border border-border/70 bg-background/60">
                      {catalogItem?.icon ? <Image src={catalogItem.icon} alt="" width={44} height={44} className="size-10 object-contain" /> : <PackageOpen className="size-5 text-muted-foreground" aria-hidden="true" />}
                    </div>
                    <span className="min-w-0 flex-1 break-words text-sm leading-5">{catalogItem?.name ?? "未知物品"}</span>
                    <strong className="shrink-0 font-number text-base">{fmt(item.count)}</strong>
                  </div>;
                })}
              </div>
            </section> : null}
            {items.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">没有匹配的库存物品。</div> : null}
          </> : null}
          {data ? <p className="mt-5 text-xs text-muted-foreground">读取时间：{new Date(data.fetchedAt).toLocaleString()}</p> : null}
        </section>
      </div>
    </main>
  );
}
