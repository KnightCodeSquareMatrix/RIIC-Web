"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, PackageOpen, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { getSklandInventory } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import itemCatalog from "@/generated/item-catalog.json";
import { useLocale } from "next-intl";
import type { DisplayError, SklandInventoryData } from "@/types";

const catalog = itemCatalog as Record<string, { name?: string; icon?: string }>;
const fmt = (value: number) => value.toLocaleString("zh-CN");
const BATTLE_RECORD_IDS = new Set(["2001", "2002", "2003", "2004"]);
const COMMON_IDS = ["4002", "4003", "4001", "4004", "4005", "7004", "7003", "7001"];
const INFRASTRUCTURE_MATERIAL_IDS = new Set(["3112", "3113", "3114", "3131", "3132", "3133", "3401", "3105"]);
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
const COST_BY_RARITY: Record<number, { lmd: number; exp: number }> = {
  3: { lmd: 247_000, exp: 458_640 }, 4: { lmd: 341_000, exp: 633_360 },
  5: { lmd: 458_000, exp: 851_760 }, 6: { lmd: 588_000, exp: 1_092_000 },
};
const BATTLE_RECORD_EXP = { "2001": 200, "2002": 400, "2003": 1_000, "2004": 2_000 } as const;
const MAX_LEVEL_BY_TARGET: Record<string, number> = { "0": 50, "1": 50, "2": 90 };
// Categories from ArkMowers/arknights-mower arknights_mower/utils/depot.py.
const MATERIAL_GROUPS: Record<string, string[]> = {"稀有度5":["烧结核凝晶","晶体电子单元","D32钢","双极纳米片","聚合剂","重相位对映体"],"稀有度4":["提纯源岩","改量装置","聚酸酯块","糖聚块","异铁块","酮阵列","转质盐聚块","切削原液","精炼溶剂","晶体电路","炽合金块","聚合凝胶","白马醇","三水锰矿","五水研磨石","RMA70-24","环烃预制体","固化纤维板","手性屈光体"],"稀有度3":["固源岩组","全新装置","聚酸酯组","糖组","异铁组","酮凝集组","转质盐组","化合切削液","半自然溶剂","晶体元件","炽合金","凝胶","扭转醇","轻锰矿","研磨石","RMA70-12","环烃聚质","褐素纤维","类凝结核"],"稀有度2":["固源岩","装置","聚酸酯","糖","异铁","酮凝集"],"稀有度1":["源岩","破损装置","酯原料","代糖","异铁碎片","双酮"],"模组":["模组数据块","数据增补仪","数据增补条"],"技能书":["技巧概要·卷3","技巧概要·卷2","技巧概要·卷1"],"芯片相关":["重装双芯片","重装芯片组","重装芯片","狙击双芯片","狙击芯片组","狙击芯片","医疗双芯片","医疗芯片组","医疗芯片","术师双芯片","术师芯片组","术师芯片","先锋双芯片","先锋芯片组","先锋芯片","近卫双芯片","近卫芯片组","近卫芯片","辅助双芯片","辅助芯片组","辅助芯片","特种双芯片","特种芯片组","特种芯片","采购凭证","芯片助剂"]};

export default function InventoryPage() {
  const locale = useLocale();
  const [data, setData] = useState<SklandInventoryData | null>(null);
  const [query, setQuery] = useState("");
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [error, setError] = useState<DisplayError | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualCounts, setManualCounts] = useState<Record<string, string>>({});
  const [targetRarity, setTargetRarity] = useState(6);
  const [targetElite, setTargetElite] = useState(2);
  const [targetLevel, setTargetLevel] = useState(60);

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
      for (const id of COMMON_IDS) {
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
  const commonItems = useMemo(() => featuredItems.filter((item) => !BATTLE_RECORD_IDS.has(item.id)), [featuredItems]);
  const experienceItems = useMemo(() => featuredItems.filter((item) => BATTLE_RECORD_IDS.has(item.id)), [featuredItems]);
  const otherItems = useMemo(() => items.filter((item) => !FEATURED_IDS.has(item.id)), [items]);
  const infrastructureItems = useMemo(() => otherItems.filter((item) => INFRASTRUCTURE_MATERIAL_IDS.has(item.id)), [otherItems]);
  const generalItems = useMemo(() => otherItems.filter((item) => !INFRASTRUCTURE_MATERIAL_IDS.has(item.id)), [otherItems]);
  const materialGroups = useMemo(() => {
    const remaining = new Set(generalItems.map((item) => item.id));
    const groups = Object.entries(MATERIAL_GROUPS).map(([title, names]) => {
      const groupedItems = generalItems
        .filter((item) => names.includes(catalog[item.id]?.name ?? ""))
        .sort((a, b) => names.indexOf(catalog[a.id]?.name ?? "") - names.indexOf(catalog[b.id]?.name ?? ""));
      groupedItems.forEach((item) => remaining.delete(item.id));
      return { title, items: groupedItems };
    });
    groups.push({ title: "其他材料", items: generalItems.filter((item) => remaining.has(item.id)) });
    return groups.filter((group) => group.items.length > 0);
  }, [generalItems]);
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
    const isStartingPoint = targetElite === 0 && targetLevel === 1;
    const levelRatio = targetLevel / 60;
    const eliteRatio = targetElite === 2 ? 1 : targetElite === 1 ? 0.58 : 0.22;
    const baseCost = COST_BY_RARITY[targetRarity] ?? COST_BY_RARITY[6];
    const costScale = (0.35 + levelRatio * 0.65) * (0.45 + eliteRatio * 0.55);
    const targetCost = {
      lmd: isStartingPoint ? 0 : Math.round(baseCost.lmd * costScale),
      exp: isStartingPoint ? 0 : Math.round(baseCost.exp * costScale),
    };
    const lmdCount = targetCost.lmd === 0 ? 0 : itemCount("4001") / targetCost.lmd;
    const exp = (Object.entries(BATTLE_RECORD_EXP) as Array<[keyof typeof BATTLE_RECORD_EXP, number]>).reduce(
      (total, [id, value]) => total + itemCount(id) * value,
      0,
    );
    return {
      count: targetCost.exp === 0 ? 0 : Math.min(lmdCount, exp / targetCost.exp),
      exp,
      lmdCount,
      targetCost,
    };
  }, [itemCount, targetElite, targetLevel, targetRarity]);
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-8 pt-5 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-lg font-semibold"><span className="h-6 w-1.5 bg-[#FFD501]" aria-hidden="true" />{locale === "en" ? "Inventory" : "查看库存"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{locale === "en" ? "Read-only inventory from Skland." : "读取森空岛仓库物品，仅查看，不修改游戏数据。"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEstimateOpen(true)} disabled={loading || !!error}><Calculator className="size-4" />资源估算</Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading} aria-label="刷新库存"><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />刷新</Button>
            <Link href="/" aria-label="返回基建终端" className="grid size-11 place-items-center border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ArrowLeft className="size-5" /></Link>
          </div>
        </header>

        <section className="p-1 sm:p-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2"><PackageOpen className="size-5 text-[#FFD501]" /><h2 className="text-xl font-semibold">背包物品</h2></div>
            <span className="text-sm text-muted-foreground">共 {items.length} 项</span>
          </div>
          <div className="relative mt-4 max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物品名称" className="h-9 pl-9" aria-label="搜索库存" /></div>
          {error ? <div className="mt-5 border border-amber-400/40 bg-amber-50/10 px-4 py-3 text-sm text-amber-200">{error.message || "库存读取失败，请稍后重试。"}</div> : null}
          {!error && loading ? <div className="py-16 text-center text-sm text-muted-foreground">正在读取森空岛库存...</div> : null}
          {!error && !loading ? <>
            <div className="mt-5 grid gap-6">
              <div className="min-w-0">
              <h3 className="mb-3 border-b border-border pb-3 text-xl font-medium">常用</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {commonItems.map((item) => {
                  const catalogItem = catalog[item.id];
                  return <div key={item.id} className="flex min-h-[74px] items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted/40">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted/30">
                      {catalogItem?.icon ? <Image src={catalogItem.icon} alt="" width={44} height={44} className="size-10 object-contain" /> : <PackageOpen className="size-5 text-muted-foreground" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="block break-words">{catalogItem?.name ?? "未知物品"}</span>
                    {MANUAL_RESOURCE_IDS.includes(item.id) || !apiCountById.has(item.id) ? <Input
                      inputMode="numeric"
                      value={manualCounts[item.id] ?? ""}
                      onChange={(event) => setManualCount(item.id, event.target.value)}
                      placeholder={apiCountById.has(item.id) ? String(apiCountById.get(item.id)) : "填写数量"}
                      aria-label={`填写${catalogItem?.name ?? "资源"}数量`}
                      className="mt-1 h-9 w-full min-w-0 px-2 font-number text-xs"
                    /> : <span className="mt-1 block text-xs text-muted-foreground">拥有：{fmt(item.count)}</span>}
                    </div>
                  </div>;
                })}
              </div>
              </div>
              <div className="border-b border-border pb-5">
                <h3 className="mb-3 border-b border-border pb-3 text-xl font-medium">经验卡</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {experienceItems.map((item) => {
                    const catalogItem = catalog[item.id];
                    return <div key={item.id} className="flex min-h-[74px] items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted/40">
                      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted/30">
                        {catalogItem?.icon ? <Image src={catalogItem.icon} alt="" width={44} height={44} className="size-10 object-contain" /> : <PackageOpen className="size-5 text-muted-foreground" aria-hidden="true" />}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm"><span className="block truncate">{catalogItem?.name ?? "未知物品"}</span><span className="mt-1 block text-xs text-muted-foreground">拥有：{fmt(item.count)}</span></span>
                    </div>;
                  })}
                </div>
              </div>
            <Dialog open={estimateOpen} onOpenChange={setEstimateOpen}>
              <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[min(800px,calc(100vw-2rem))]">
                <DialogHeader><DialogTitle>资源估算</DialogTitle></DialogHeader>
                <DialogBody className="min-h-0 overflow-y-auto pb-6">
            <section className="grid min-w-0 auto-rows-fr sm:grid-cols-2">
              <div className="grid min-w-0 grid-rows-[24px_44px_56px_1fr_36px] gap-3 pb-5 sm:pb-0 sm:pr-6">
                <h3 className="text-base font-semibold">寻访估算</h3>
                <p className="flex items-center text-sm text-muted-foreground">当前资源可用寻访</p>
                <p className="font-number text-4xl font-semibold leading-[56px]"><span className="text-[#FFD501]">{fmt(pullSummary.total)}</span> <span className="text-xl">抽</span></p>
              <div className="grid content-start gap-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
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
                <p className="text-xs leading-[18px] text-muted-foreground">另余 {fmt(pullSummary.remainingOrundum)} 合成玉</p>
              </div>
              <div className="grid min-w-0 grid-rows-[24px_44px_56px_1fr_36px] gap-3 border-t border-border/70 pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <h3 className="text-base font-semibold">养成估算</h3>
                <div className="grid grid-cols-3 items-center gap-2 [&_select]:min-w-0 [&_select]:w-full [&_select]:h-11">
                  <select value={targetRarity} onChange={(event) => { const rarity = Number(event.target.value); setTargetRarity(rarity); if (rarity < 4 && targetElite === 2) { setTargetElite(1); setTargetLevel(Math.min(targetLevel, 50)); } }} className="h-9 border border-border bg-background px-2 text-sm" aria-label="目标星级">
                    {[3, 4, 5, 6].map((rarity) => <option key={rarity} value={rarity}>{rarity}★</option>)}
                  </select>
                  <select value={targetElite} onChange={(event) => { const elite = Number(event.target.value); setTargetElite(elite); setTargetLevel(Math.min(targetLevel, MAX_LEVEL_BY_TARGET[String(elite)])); }} className="h-9 border border-border bg-background px-2 text-sm" aria-label="目标精英阶段">
                    {[0, 1, 2].filter((elite) => targetRarity >= (elite === 2 ? 4 : 3)).map((elite) => <option key={elite} value={elite}>精{elite}</option>)}
                  </select>
                  <select value={targetLevel} onChange={(event) => setTargetLevel(Number(event.target.value))} className="h-9 border border-border bg-background px-2 text-sm" aria-label="目标等级">
                    {[1, 30, 40, 50, 60, 70, 80, 90].filter((level) => level <= MAX_LEVEL_BY_TARGET[String(targetElite)]).map((level) => <option key={level} value={level}>{level}级</option>)}
                  </select>
                </div>
                <p className="font-number text-4xl font-semibold leading-[56px]"><span className="text-[#FFD501]">{sixStarSummary.count.toFixed(2)}</span> <span className="text-xl">个</span></p>
                <div className="grid content-start gap-3 border-t border-border/70 pt-3 text-xs text-muted-foreground [&_p]:flex-wrap [&_strong]:break-all">
                  <p className="flex justify-between gap-3"><span>龙门币</span><strong className="font-number text-foreground">{fmt(itemCount("4001"))} / {fmt(sixStarSummary.targetCost.lmd)}</strong></p>
                  <p className="flex justify-between gap-3"><span>作战记录经验</span><strong className="font-number text-foreground">{fmt(sixStarSummary.exp)} / {fmt(sixStarSummary.targetCost.exp)}</strong></p>
                </div>
                <p className="text-xs leading-[18px] text-muted-foreground">仅考虑升级和精英化，从精0 1级开始。</p>
              </div>
            </section>
                </DialogBody>
              </DialogContent>
            </Dialog>
            </div>
            {materialGroups.map((group) => <section key={group.title} className="mt-7 border-t border-border pt-5">
              <h3 className="mb-3 border-b border-border pb-2 text-lg font-semibold">{group.title}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                {group.items.map((item) => {
                  const catalogItem = catalog[item.id];
                  return <div key={item.id} className="flex min-h-[74px] items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted/40">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted/30">
                      {catalogItem?.icon ? <Image src={catalogItem.icon} alt="" width={44} height={44} className="size-10 object-contain" /> : <PackageOpen className="size-5 text-muted-foreground" aria-hidden="true" />}
                    </div>
                    <span className="min-w-0 flex-1 break-words text-sm leading-5"><span className="block">{catalogItem?.name ?? "未知物品"}</span><span className="mt-1 block text-xs text-muted-foreground">拥有：{fmt(item.count)}</span></span>
                  </div>;
                })}
              </div>
            </section>)}
            {infrastructureItems.length > 0 ? <section className="mt-7 border-t border-border pt-5">
              <h3 className="mb-3 border-b border-border pb-2 text-lg font-semibold">基建材料</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                {infrastructureItems.map((item) => {
                  const catalogItem = catalog[item.id];
                  return <div key={item.id} className="flex min-h-[74px] items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted/40">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted/30">
                      {catalogItem?.icon ? <Image src={catalogItem.icon} alt="" width={44} height={44} className="size-10 object-contain" /> : <PackageOpen className="size-5 text-muted-foreground" aria-hidden="true" />}
                    </div>
                    <span className="min-w-0 flex-1 break-words text-sm leading-5"><span className="block">{catalogItem?.name ?? "未知物品"}</span><span className="mt-1 block text-xs text-muted-foreground">拥有：{fmt(item.count)}</span></span>
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
