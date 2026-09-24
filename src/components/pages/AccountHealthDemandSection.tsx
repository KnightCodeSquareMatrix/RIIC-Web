"use client";

import { ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";

import { loadHealthDemand, persistHealthDemand, type HealthDemand, type HealthDemandField } from "@/account-health-demand";

type Choice = { value: string; zh: string; en: string };
type Field = { key: HealthDemandField; zh: string; en: string; choices: Choice[] };

const FIELDS: Field[] = [
  { key: "orundumPlan", zh: "搓玉计划", en: "Orundum production", choices: [
    { value: "none", zh: "暂无", en: "No plan" },
    { value: "planned", zh: "计划进行", en: "Planned" },
  ] },
  { key: "outputPriority", zh: "产出与操作取向", en: "Output and effort", choices: [
    { value: "maximize", zh: "优先最大产出", en: "Maximize output" },
    { value: "balanced", zh: "兼顾产出与省心", en: "Balanced" },
    { value: "low-maintenance", zh: "优先省心", en: "Low maintenance" },
  ] },
  { key: "resourceFocus", zh: "资源侧重点", en: "Resource focus", choices: [
    { value: "balanced", zh: "钱书均衡", en: "Balanced LMD and EXP" },
    { value: "lmd", zh: "龙门币", en: "LMD" },
    { value: "experience", zh: "作战记录", en: "EXP" },
  ] },
  { key: "layoutChange", zh: "布局调整范围", en: "Layout changes", choices: [
    { value: "keep", zh: "保持现有布局", en: "Keep layout" },
    { value: "recipes-only", zh: "可调整产线与订单", en: "Recipes and orders only" },
    { value: "rebuild-ok", zh: "可重建布局", en: "Rebuild allowed" },
  ] },
  { key: "twoPowerPlants", zh: "两发电布局", en: "Two power plants", choices: [
    { value: "accept", zh: "可以接受", en: "Accept" },
    { value: "avoid", zh: "不接受", en: "Avoid" },
  ] },
  { key: "loginCadence", zh: "通常上线节奏", en: "Usual check-in", choices: [
    { value: "twice-daily", zh: "每天至少两次", en: "At least twice daily" },
    { value: "daily", zh: "大致每天一次", en: "About once daily" },
    { value: "irregular", zh: "不规律", en: "Irregular" },
  ] },
];

export function AccountHealthDemandSection({ identityKey, en, hidden = false, onChange }: { identityKey: string; en: boolean; hidden?: boolean; onChange?: (value: HealthDemand) => void }) {
  const [demand, setDemand] = useState<HealthDemand>({});
  useEffect(() => {
    setDemand(loadHealthDemand(window.localStorage, identityKey) ?? {});
  }, [identityKey]);

  const update = (field: HealthDemandField, value: string) => {
    const next = { ...demand, [field]: value || undefined };
    setDemand(next);
    onChange?.(next);
    try { persistHealthDemand(window.localStorage, identityKey, next); } catch { /* Keep the current selection. */ }
  };

  if (hidden) return null;
  return (
    <section aria-labelledby="account-health-demand-title" data-account-health-demand className="min-w-0 rounded-[4px] border border-border bg-card p-4 sm:p-5">
        <h2 id="account-health-demand-title" className="flex items-center gap-2 text-base font-semibold"><ClipboardList className="size-4" aria-hidden="true" />{en ? "Infrastructure usage preferences" : "基建使用偏好"}</h2>
        <p className="mt-2 text-xs text-muted-foreground">{en ? "Only settled choices belong here; unset items fall back to neutral defaults and do not affect other answers." : "每项只保留已定的选择；尚未决定的项保持未设置即可，按中性默认处理，不影响其他判断。"}</p>
        <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          {FIELDS.map((field) => (
            <div key={field.key} className="grid min-w-0 gap-2">
              <label htmlFor={`health-demand-${field.key}`} className="text-sm font-medium text-foreground">
                {en ? field.en : field.zh}
              </label>
              <select
                id={`health-demand-${field.key}`}
                value={demand[field.key] ?? ""}
                onChange={(event) => update(field.key, event.target.value)}
                className="h-10 w-full min-w-0 rounded-sm border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <option value="">{en ? "Not specified" : "未设置"}</option>
                {field.choices.map((choice) => <option key={choice.value} value={choice.value}>{en ? choice.en : choice.zh}</option>)}
              </select>
            </div>
          ))}
        </div>
    </section>
  );
}
