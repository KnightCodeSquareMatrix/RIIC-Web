"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Building2,
  Check,
  Clipboard,
  Database,
  DoorOpen,
  HeartPulse,
  LogOut,
  PackageCheck,
  Search,
  Shirt,
  Trash2,
  UserPlus,
  UsersRound,
  Zap,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RemoteAvatar } from "@/components/ui/remote-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LevelDiamonds, OperatorSlot, roomVisualFor } from "@/components";
import {
  InfraTechnicalCard as OverviewTechnicalCard,
  InfraTechnicalHeading as OverviewTechnicalHeading,
} from "@/components/InfraTechnicalCard";
import {
  StatusCenterHeader,
  StatusCenterLoading,
  StatusCenterPage,
} from "@/components/pages/StatusCenterShell";
import { cn } from "@/lib/utils";
import { operatorPortraitFor, operatorProfessionFor } from "@/operatorPortraits";
import { roomGridTone } from "@/schedule-view-presentation";
import { SklandLoginPanel } from "@/skland-components";
import {
  deriveSklandBuildingMetrics,
  type SklandStatusMetric,
} from "@/skland-status-metrics";
import type {
  DisplayError,
  SklandAccountSummary,
  SklandBindingSummary,
  SklandInfrastructureRoom,
  SklandOperatorStatus,
  SklandOwnedSkin,
  SklandSessionData,
  SklandScheduleSnapshot,
  SklandStatusSnapshot,
} from "@/types";
import { deriveSklandBindingState } from "@/skland-binding-state";

const PRODUCT_LABELS: Record<string, string> = {
  gold: "贵金属 / 赤金",
  battle_record: "作战记录",
  originium: "源石碎片",
  unknown: "其他配方",
};

const PROFESSION_LABELS: Record<string, string> = {
  PIONEER: "先锋",
  WARRIOR: "近卫",
  TANK: "重装",
  SNIPER: "狙击",
  CASTER: "术师",
  MEDIC: "医疗",
  SUPPORT: "辅助",
  SPECIAL: "特种",
  TOKEN: "召唤物",
  TRAP: "装置",
  UNKNOWN: "未分类",
};

const ROOM_LABELS: Record<SklandInfrastructureRoom["group"], string> = {
  control: "控制中枢",
  trading: "贸易站",
  manufacture: "制造站",
  power: "发电站",
  dormitory: "宿舍",
  meeting: "会客室",
  hire: "人力办公室",
  processing: "加工站",
  training: "训练室",
};

const INITIAL_LIST_LIMIT = 60;
const RARITY_OPTIONS = [
  { value: "all", label: "全部星级" },
  ...[6, 5, 4, 3, 2, 1].map((value) => ({ value: String(value), label: `${value} 星` })),
];

type FilterOption = {
  value: string;
  label: string;
};

function OperatorFilterCombobox({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onValueChange: (value: string) => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Combobox
      items={options}
      value={selected}
      inputValue={query ?? selected?.label ?? ""}
      itemToStringValue={(option) => option.label}
      isItemEqualToValue={(option, selectedOption) => option.value === selectedOption.value}
      autoHighlight
      onInputValueChange={(inputValue) => setQuery(inputValue)}
      onOpenChange={(open) => {
        if (!open) setQuery(null);
      }}
      onValueChange={(option) => {
        if (option) {
          setQuery(null);
          onValueChange(option.value);
        }
      }}
    >
      <ComboboxInput className="font-number h-11 w-full" aria-label={label} placeholder={`搜索${label}`} />
      <ComboboxContent>
        <ComboboxEmpty>没有匹配的{label}</ComboboxEmpty>
        <ComboboxList>
          {(option) => (
            <ComboboxItem key={option.value} value={option} className="font-number">
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export interface SklandStatusProps {
  scheduleSnapshot: SklandScheduleSnapshot | null;
  snapshot: SklandStatusSnapshot | null;
  accounts: SklandAccountSummary[];
  activeAccountId: string | null;
  bindingCount: number;
  bindingSummary: SklandBindingSummary;
  sessionLoading: boolean;
  layoutMatches: boolean;
  layoutDirty: boolean;
  configured: boolean;
  disabledReason: string | null;
  busy: boolean;
  error: DisplayError | null;
  onAuthenticated: (session: SklandSessionData) => void;
  onRoleChange: (accountId: string, uid: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onRetryStatus: () => void;
  onDeleteAllData: () => Promise<void>;
  onApplyLayout: () => void;
  onContinueSetup: () => void;
  onOpenCalculator: () => void;
  onCopyUid: (uid: string) => void;
}

function credentialExpiryLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function SklandDataControls({
  account,
  busy,
  onDeleteAllData,
}: {
  account: SklandAccountSummary;
  busy: boolean;
  onDeleteAllData: () => Promise<void>;
}) {
  return (
    <section className="grid gap-3 pt-2" data-skland-data-controls>
      <div>
        <h2 className="text-sm font-semibold">数据管理</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground" data-ui-number-font>
          登录凭证将在 {credentialExpiryLabel(account.credentialExpiresAt)} 固定过期。按住下方按钮会永久删除全部森空岛账号、凭证、同步数据及可关联记录；MAA 导入与手动布局会保留。
        </p>
      </div>
      <HoldToConfirm
        disabled={busy}
        confirmLabel="正在删除"
        className="w-full sm:w-fit"
        onConfirm={() => void onDeleteAllData().catch(() => {
          // 上层统一展示删除失败信息；此处只避免产生未处理的 Promise rejection。
        })}
      >
        <Trash2 className="size-4" />按住删除全部森空岛数据
      </HoldToConfirm>
    </section>
  );
}

function formatDateTime(timestamp: number | null): string {
  const date = timestamp !== null && timestamp > 0 && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : null;
  if (!date || Number.isNaN(date.getTime())) return "未提供";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCompactDateTime(timestamp: number | null): string {
  const date = timestamp !== null && timestamp > 0 && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : null;
  if (!date || Number.isNaN(date.getTime())) return "未提供";
  const time = [date.getHours(), date.getMinutes()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${time}`;
}

function formatDate(timestamp: number | null): string {
  const date = timestamp !== null && timestamp > 0 && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : null;
  if (!date || Number.isNaN(date.getTime())) return "未提供";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

function formatDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (!safeSeconds) return "已完成";
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${Math.max(1, minutes)} 分钟`;
}

function useMinuteTimestamp(baseTimestamp: number): number {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  useEffect(() => {
    setElapsedMinutes(0);
    const timer = window.setInterval(() => setElapsedMinutes((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [baseTimestamp]);
  return baseTimestamp + elapsedMinutes * 60;
}

function maskedUid(uid: string): string {
  if (uid.length <= 6) return `${uid.slice(0, 2)}••${uid.slice(-2)}`;
  return `${uid.slice(0, 3)}••••${uid.slice(-3)}`;
}

function roomLabel(room: SklandInfrastructureRoom): string {
  const base = ROOM_LABELS[room.group];
  return ["control", "meeting", "hire", "processing", "training"].includes(room.group) ? base : `${base} ${room.index + 1}`;
}

function roomMaxLevel(room: SklandInfrastructureRoom): number {
  return room.group === "control" || room.group === "dormitory" ? 5 : 3;
}

function professionLabel(profession: string): string {
  return PROFESSION_LABELS[profession] ?? profession;
}

function ProgressMeter({
  label,
  current,
  total,
  technical = false,
}: {
  label: string;
  current: number;
  total: number;
  technical?: boolean;
}) {
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
  const percent = safeTotal > 0 ? Math.min(100, Math.round((safeCurrent / safeTotal) * 100)) : 0;
  const ariaMax = Math.max(1, safeTotal);
  const ariaCurrent = Math.min(ariaMax, safeCurrent);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className={technical ? "text-white/58" : "text-muted-foreground"}>{label}</span>
        <span className={cn("font-medium tabular-nums", technical && "text-[var(--room-accent)]")}>
          {safeCurrent}/{safeTotal}
        </span>
      </div>
      <div
        className={cn(
          "h-1.5 overflow-hidden",
          technical ? "bg-white/12" : "rounded-full bg-muted"
        )}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={ariaMax}
        aria-valuenow={ariaCurrent}
      >
        <div
          className={cn("h-full", technical ? "bg-[var(--room-accent)]" : "rounded-full bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function OverviewTab({
  snapshot,
  onContinueSetup,
  onOpenCalculator,
}: {
  snapshot: SklandStatusSnapshot;
  onContinueSetup: () => void;
  onOpenCalculator: () => void;
}) {
  const { infrastructure, player, progress } = snapshot;
  const fullProductionRooms = infrastructure.rooms.filter(
    (room) =>
      (room.group === "trading" || room.group === "manufacture")
      && room.production.stock !== null
      && room.production.capacity !== null
      && room.production.capacity > 0
      && room.production.stock >= room.production.capacity
  );
  const readyRecruit = (progress.recruit ?? []).filter(
    (slot) => slot.state === "completed"
      || (slot.state === "recruiting" && slot.finishTs > 0 && slot.finishTs <= infrastructure.currentTs)
  );
  const dronesFull = infrastructure.labor.maxValue > 0
    && infrastructure.labor.value >= infrastructure.labor.maxValue;
  const attentionItems = [
    infrastructure.tiredOperators.length
      ? `${infrastructure.tiredOperators.length} 名干员心情过低`
      : null,
    fullProductionRooms.length
      ? `${fullProductionRooms.length} 个生产设施库存已满`
      : null,
    readyRecruit.length ? `${readyRecruit.length} 个公开招募槽位已完成` : null,
    dronesFull ? "无人机已达到上限" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="grid gap-3">
      <section
        className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3"
        aria-label="现在值得处理"
      >
        <OverviewTechnicalCard group="manufacture" className="min-h-40 xl:col-span-2">
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <OverviewTechnicalHeading icon={<AlertTriangle className="size-4" aria-hidden="true" />}>
                  现在值得处理
                </OverviewTechnicalHeading>
                <p className="font-number mt-3 text-lg font-semibold">
                  {attentionItems.length ? `${attentionItems.length} 项状态提醒` : "基建运转平稳"}
                </p>
              </div>
              <strong className="text-4xl font-semibold tabular-nums text-[var(--room-accent)]">
                {attentionItems.length}
              </strong>
            </div>
            <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {attentionItems.length ? attentionItems.map((item) => (
                <div key={item} className="flex items-start gap-2 border-t border-white/10 pt-2 text-sm text-white/82">
                  <AlertTriangle
                    className="mt-0.5 size-3.5 shrink-0 text-[var(--room-accent)]"
                    aria-hidden="true"
                  />
                  <span className="font-number">{item}</span>
                </div>
              )) : (
                <p className="border-t border-white/10 pt-2 text-sm text-white/58 sm:col-span-2">
                  当前没有库存、公招、训练或心情方面的明确提醒。
                </p>
              )}
            </div>
          </div>
        </OverviewTechnicalCard>

        <OverviewTechnicalCard group="control" className="min-h-40">
          <div className="grid h-full content-between gap-4">
            <div>
              <OverviewTechnicalHeading icon={<Database className="size-4" aria-hidden="true" />}>
                已同步到排班助手
              </OverviewTechnicalHeading>
              <p className="mt-4 text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                {snapshot.operators.length}
                <span className="ml-1 text-sm font-normal text-white/60">名干员</span>
              </p>
              <p className="font-number mt-1 text-xs text-white/58">
                当前布局 · {infrastructure.layoutLabel ?? "未识别"}
              </p>
            </div>
            <div className="flex flex-wrap justify-start gap-2">
              <Button
                type="button"
                size="dialog"
                className="bg-white text-[#272a2b] hover:bg-white/90"
                onClick={onOpenCalculator}
              >
                前往生成排班
              </Button>
              <Button
                type="button"
                size="dialog"
                className="border-white/22 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                variant="outline"
                onClick={onContinueSetup}
              >
                继续配置布局
              </Button>
            </div>
          </div>
        </OverviewTechnicalCard>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="状态摘要">
        <OverviewTechnicalCard group="trading" className="min-h-36 md:col-span-2 xl:col-span-1">
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<HeartPulse className="size-4" aria-hidden="true" />}>
              当前理智
            </OverviewTechnicalHeading>
            <div className="mt-5 flex items-end gap-1">
              <strong className="text-4xl font-semibold tabular-nums text-[var(--room-accent)]">
                {player.sanity?.current ?? "—"}
              </strong>
              {player.sanity ? (
                <span className="pb-1 text-sm tabular-nums text-white/52">/ {player.sanity.max}</span>
              ) : null}
            </div>
            <p className="font-number mt-auto pt-4 text-xs text-white/58">
              {!player.sanity
                ? "森空岛暂未提供理智状态"
                : player.sanity.current >= player.sanity.max
                  ? "理智已满"
                  : `预计回满：${formatDateTime(player.sanity.completeRecoveryTime)}`}
            </p>
          </div>
        </OverviewTechnicalCard>

        <OverviewTechnicalCard group="power" className="min-h-36">
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<Zap className="size-4" aria-hidden="true" />}>
              无人机
            </OverviewTechnicalHeading>
            <p className="mt-5 text-3xl font-semibold tabular-nums text-[var(--room-accent)]">
              {infrastructure.labor.value}
              <span className="ml-1 text-sm font-normal text-white/52">
                / {infrastructure.labor.maxValue}
              </span>
            </p>
            <p className="font-number mt-auto pt-4 text-xs text-white/58">
              {dronesFull
                ? "无人机已达当前上限"
                : `下次恢复约 ${formatDuration(infrastructure.labor.remainSecs)}`}
            </p>
          </div>
        </OverviewTechnicalCard>

        <OverviewTechnicalCard group="manufacture" className="min-h-36">
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<Activity className="size-4" aria-hidden="true" />}>
              日常与周常
            </OverviewTechnicalHeading>
            <div className="mt-5 grid gap-3">
              {progress.routine ? (
                <>
                  <ProgressMeter technical label="日常" {...progress.routine.daily} />
                  <ProgressMeter technical label="周常" {...progress.routine.weekly} />
                </>
              ) : (
                <p className="text-xs text-white/58">森空岛暂未提供任务进度。</p>
              )}
            </div>
          </div>
        </OverviewTechnicalCard>
      </section>

      <section
        className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]"
        aria-label="博士档案与收藏"
      >
        <OverviewTechnicalCard group="control" className="min-h-48">
          <OverviewTechnicalHeading icon={<UsersRound className="size-4" aria-hidden="true" />}>
            博士档案
          </OverviewTechnicalHeading>
          <p className="mt-3 text-base font-semibold text-white">{player.nickname}</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            <div className="border-t border-white/10 pt-2">
              <dt className="text-white/50">注册时间</dt>
              <dd className="font-number mt-1 font-medium text-white">{formatDate(player.registerTs)}</dd>
            </div>
            <div className="border-t border-white/10 pt-2">
              <dt className="text-white/50">主线进度</dt>
              <dd className="font-number mt-1 font-medium text-[var(--room-accent)]">
                {player.mainStageProgress ?? "未提供"}
              </dd>
            </div>
            <div className="border-t border-white/10 pt-2">
              <dt className="text-white/50">助理</dt>
              <dd className="mt-1 font-medium text-white">{player.secretary?.name ?? "未提供"}</dd>
            </div>
            <div className="border-t border-white/10 pt-2">
              <dt className="text-white/50">月卡到期</dt>
              <dd className="font-number mt-1 font-medium text-white">{formatDate(player.subscriptionEnd)}</dd>
            </div>
          </dl>
          {player.resume ? (
            <p className="mt-4 border-t border-white/10 pt-3 text-sm leading-6 text-white/58">{player.resume}</p>
          ) : null}
        </OverviewTechnicalCard>

        <OverviewTechnicalCard group="trading" className="min-h-48">
          <OverviewTechnicalHeading icon={<Boxes className="size-4" aria-hidden="true" />}>
            收藏概况
          </OverviewTechnicalHeading>
          <dl className="mt-5 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-3">
            <div className="px-3 first:pl-0">
              <dt className="text-xs text-white/50">干员</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                {player.counts.operators ?? "—"}
              </dd>
            </div>
            <div className="px-3">
              <dt className="text-xs text-white/50">皮肤</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                {player.counts.skins ?? "—"}
              </dd>
            </div>
            <div className="px-3">
              <dt className="text-xs text-white/50">家具</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                {player.counts.furniture ?? "—"}
              </dd>
            </div>
          </dl>
        </OverviewTechnicalCard>
      </section>

      <section aria-labelledby="overview-recruit-title">
        <OverviewTechnicalCard group="hire" className="min-h-36">
          <OverviewTechnicalHeading icon={<PackageCheck className="size-4" aria-hidden="true" />}>
            <span id="overview-recruit-title">公开招募</span>
          </OverviewTechnicalHeading>
          {progress.recruit?.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {progress.recruit.map((slot) => {
                const finished = slot.state === "completed"
                  || (slot.state === "recruiting" && slot.finishTs > 0 && slot.finishTs <= infrastructure.currentTs);
                const label = finished
                  ? "已完成"
                  : slot.state === "locked"
                    ? "未解锁"
                    : slot.state === "standby"
                      ? "空闲"
                      : "进行中";
                return (
                  <div key={slot.index} className="border-t border-white/12 bg-black/12 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="font-number">槽位 {slot.index + 1}</strong>
                      <span className={finished ? "text-[var(--room-accent)]" : "text-white/58"}>
                        {label}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-nowrap text-xs tabular-nums text-white/58">
                      {slot.finishTs > 0 ? formatDateTime(slot.finishTs) : "暂无计时"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : <p className="mt-5 text-sm text-white/58">森空岛暂未提供公招计时。</p>}
        </OverviewTechnicalCard>
      </section>
    </div>
  );
}

function RoomCard({ room }: { room: SklandInfrastructureRoom }) {
  const productionRoom = room.group === "trading" || room.group === "manufacture" ? room : null;
  const isAuxiliaryRoom = ["meeting", "training", "hire", "processing"].includes(room.group);
  const hasRoomDetails = productionRoom !== null || room.group === "hire";
  const visual = roomVisualFor(room.group);
  const gridTone = roomGridTone(room.group);
  const style = {
    "--room-accent": visual.accent,
    "--room-level": visual.level,
    "--room-grid-color": gridTone.color,
    "--room-grid-opacity": gridTone.opacity,
    "--room-grid-fade-start": gridTone.fadeStart,
  } as CSSProperties;

  return (
    <article
      className={`infra-room-surface relative gap-2 overflow-hidden px-3 py-2 text-white ${
        isAuxiliaryRoom
          ? "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start"
          : "flex min-h-36 flex-col"
      }`}
      data-room-group={room.group}
      style={style}
    >
      <div
        className="infra-room-emblem absolute inset-0 bg-left bg-no-repeat"
        style={{
          backgroundImage: `url(${visual.background})`,
          backgroundPosition: "-18px center",
          backgroundSize: "auto 100%",
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 min-w-0">
        <div className="flex min-h-7 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="infra-room-accent h-5 w-1 shrink-0 bg-[var(--room-accent)]" aria-hidden="true" />
            <h4 className="font-number truncate text-sm font-medium tracking-[-0.02em] text-white [text-shadow:0_2px_3px_rgba(0,0,0,0.75)]">
              {roomLabel(room)}
            </h4>
            <LevelDiamonds level={room.level} maxLevel={roomMaxLevel(room)} variant="compact" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-white/64 max-sm:ml-3 max-sm:w-full max-sm:flex-wrap">
            {productionRoom ? (
              <strong className="infra-room-value text-xs font-semibold text-[var(--room-accent)]">
                {PRODUCT_LABELS[productionRoom.product] ?? productionRoom.product}
              </strong>
            ) : null}
            {room.group === "manufacture" ? <span className="font-number">生产力 {Math.round(room.speed * 100)}%</span> : null}
            {room.group === "dormitory" ? <span className="font-number">氛围 {room.comfort}</span> : null}
            {room.group === "hire" ? <span className="font-number">可刷新 {room.refreshCount} 次</span> : null}
            {room.group === "training" ? (
              <span className="font-number" aria-label={`实时进驻 ${room.occupancy.current} 人，共 ${room.occupancy.capacity} 个席位`}>
                {room.occupancy.current}/{room.occupancy.capacity}
              </span>
            ) : null}
          </div>
        </div>
        {room.group === "power" ? (
          <div
            className="mt-1 flex min-h-7 items-center gap-2 text-xs text-white/58"
            data-skland-power-efficiency
          >
            <span>效率</span>
            <strong className="font-number font-semibold tabular-nums text-[var(--room-accent)]">基准 100%</strong>
          </div>
        ) : null}
      </div>

      <div
        className={`relative z-10 min-w-0 ${
          isAuxiliaryRoom ? "flex justify-end" : "grid flex-1 content-between gap-2"
        }`}
      >
        <div
          className={`flex flex-wrap items-start gap-3 max-sm:grid max-sm:w-full max-sm:grid-cols-5 max-sm:gap-1.5 max-sm:[&_.infra-operator-slot]:w-full max-sm:[&_.infra-operator-slot]:[--operator-slot-size:clamp(48px,calc((100vw-72px)/5),64px)] ${
            isAuxiliaryRoom ? "justify-end" : ""
          }`}
        >
          {room.group === "training" ? ([
            { position: "trainee" as const, positionLabel: "训练位" },
            { position: "trainer" as const, positionLabel: "协助位" },
          ].map(({ position, positionLabel }) => {
            const operator = room.operators.find((candidate) => candidate.position === position);
            return (
              <OperatorSlot
                key={`${room.key}-${position}`}
                slot={operator ? {
                  name: operator.name,
                  label: operator.name,
                  portrait: operatorPortraitFor(operator.name, operator.id),
                  profession: operatorProfessionFor(operator.name),
                } : undefined}
                currentMorale={operator?.morale}
                compactView
                positionLabel={positionLabel}
              />
            );
          })) : room.operators.length ? room.operators.map((operator) => (
            <OperatorSlot
              key={`${room.key}-${operator.id}`}
              slot={{
                name: operator.name,
                label: `${operator.name} · 已工作 ${formatDuration(operator.workTime)}`,
                portrait: operatorPortraitFor(operator.name, operator.id),
                profession: operatorProfessionFor(operator.name),
              }}
              currentMorale={operator.morale}
              compactView
            />
          )) : isAuxiliaryRoom ? Array.from(
            { length: room.group === "meeting" ? 2 : 1 },
            (_, index) => <OperatorSlot key={`${room.key}-empty-${index}`} slot={undefined} compactView />,
          ) : <span className="py-2 text-sm text-white/48">当前没有进驻干员</span>}
        </div>
      </div>

      {hasRoomDetails ? <div className={`relative z-10 border-t border-white/10 pt-2 text-xs leading-5 text-white/58 ${
        isAuxiliaryRoom ? "col-span-full" : ""
      }`}>
          {productionRoom ? (
            <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 xl:flex-nowrap">
              <div className="flex items-baseline gap-1 whitespace-nowrap">
                <dt>库存</dt>
                <dd className="font-medium tabular-nums text-white">
                  {productionRoom.production.stock ?? "—"} / {productionRoom.production.capacity ?? "—"}
                </dd>
              </div>
              <div className="flex items-baseline gap-1 whitespace-nowrap">
                <dt>预计完成</dt>
                <dd
                  className="font-medium tabular-nums text-white"
                  data-infra-complete-time
                >
                  {formatCompactDateTime(productionRoom.production.completeWorkTime)}
                </dd>
              </div>
              {productionRoom.production.completed !== null ? (
                <div className="flex items-baseline gap-1 whitespace-nowrap">
                  <dt>已完成</dt>
                  <dd className="font-medium tabular-nums text-white">{productionRoom.production.completed}</dd>
                </div>
              ) : null}
              {productionRoom.production.remaining !== null ? (
                <div className="flex items-baseline gap-1 whitespace-nowrap">
                  <dt>剩余队列</dt>
                  <dd className="font-medium tabular-nums text-white">{productionRoom.production.remaining}</dd>
                </div>
              ) : null}
            </dl>
          ) : room.group === "hire" ? (
            <p className="font-number">下次完成 {formatDateTime(room.completeWorkTime)}</p>
          ) : null}

          {room.group === "trading" && room.orders.length ? (
            <details className="mt-2">
              <summary className="font-number cursor-pointer font-medium text-[var(--room-accent)]">
                查看 {room.orders.length} 笔订单
              </summary>
              <div className="mt-2 grid gap-1">
                {room.orders.map((order, index) => (
                  <p key={`${room.key}-order-${index}`} className="font-number">
                    订单 {index + 1}：交付 {order.delivery.reduce((total, item) => total + item.count, 0)}
                    ，获得 {order.reward.count} {order.reward.type === "orundum" ? "合成玉" : "龙门币"}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </div> : null}
    </article>
  );
}

function BuildingMetricCard({ metric }: { metric: SklandStatusMetric }) {
  const group = metric.visual === "rest"
    ? "dormitory"
    : metric.visual === "clue"
      ? "meeting"
      : metric.visual;

  return (
    <div
      className="h-full min-w-0"
      data-skland-metric={metric.id}
      data-metric-tone={metric.tone}
    >
      <OverviewTechnicalCard group={group} className="h-full min-h-40" showEmblem={false}>
        <div className="flex h-full min-w-0 flex-col">
          <OverviewTechnicalHeading icon={<Activity className="size-4" aria-hidden="true" />}>
            {metric.label}
          </OverviewTechnicalHeading>
          <div className="mt-5 flex min-w-0 items-end gap-1">
            <strong className="min-w-0 truncate text-3xl font-semibold leading-none tabular-nums text-[var(--room-accent)]">
              {metric.value}
            </strong>
            {metric.total !== null ? (
              <span className="mb-0.5 shrink-0 text-sm leading-none tabular-nums text-white/52">
                / {metric.total}
              </span>
            ) : null}
          </div>
          <p className="font-number mt-auto pt-4 text-xs leading-5 text-white/58">{metric.hint}</p>
        </div>
      </OverviewTechnicalCard>
    </div>
  );
}

function LayoutSyncControl({
  snapshot,
  layoutMatches,
  layoutDirty,
  onApplyLayout,
}: {
  snapshot: SklandStatusSnapshot;
  layoutMatches: boolean;
  layoutDirty: boolean;
  onApplyLayout: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { infrastructure } = snapshot;

  function requestApplyLayout() {
    if (layoutDirty) setConfirmOpen(true);
    else onApplyLayout();
  }

  const hasSuggestion = Boolean(infrastructure.layoutSuggestion);
  const status = hasSuggestion
    ? `森空岛布局 ${infrastructure.layoutLabel ?? "未识别"}`
    : "未识别可同步布局";

  return (
    <>
      <div
        className="flex min-w-0 items-center gap-2"
        data-slot="skland-layout-sync"
        aria-label="布局同步"
        aria-live="polite"
      >
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 text-xs",
            layoutMatches ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {layoutMatches
            ? <Check className="size-3.5 shrink-0" aria-hidden="true" />
            : <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />}
          <span className="font-number truncate">{status}</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 max-sm:h-11"
          disabled={!hasSuggestion || layoutMatches}
          onClick={requestApplyLayout}
        >
          <Building2 />
          {layoutMatches ? "已同步" : hasSuggestion ? "应用布局" : "不可同步"}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>覆盖当前布局设置？</DialogTitle>
            <DialogDescription>
              你已经手动修改过当前布局。继续后会使用森空岛的设施等级、制造配方和贸易订单。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="max-sm:min-w-16 sm:min-w-[88px]" type="button" size="dialog" variant="ghost" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button
              type="button"
              size="dialog"
              onClick={() => {
                onApplyLayout();
                setConfirmOpen(false);
              }}
            >
              覆盖并应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfrastructureTab({ snapshot }: { snapshot: SklandStatusSnapshot }) {
  const { infrastructure } = snapshot;
  const now = useMinuteTimestamp(infrastructure.currentTs);
  const buildingMetrics = useMemo(() => deriveSklandBuildingMetrics(snapshot, now), [snapshot, now]);
  const controlRooms = infrastructure.rooms.filter((room) => room.group === "control");
  const workRooms = infrastructure.rooms.filter((room) => room.group === "trading" || room.group === "manufacture");
  const powerRooms = infrastructure.rooms.filter((room) => room.group === "power");
  const primaryFunctionRooms = infrastructure.rooms.filter(
    (room) => room.group === "meeting" || room.group === "training",
  );
  const secondaryFunctionRooms = infrastructure.rooms.filter(
    (room) => room.group === "hire" || room.group === "processing",
  );
  const dormitoryRooms = infrastructure.rooms.filter((room) => room.group === "dormitory");
  const alignDenseInfrastructureRows = powerRooms.length >= 2 && workRooms.length >= 6 && dormitoryRooms.length >= 4;

  return (
    <div className="grid gap-7">
      <section
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-label="基建概览"
        data-skland-overview-grid
        data-skland-metric-section="building"
      >
        <OverviewTechnicalCard
          group="training"
          className="min-h-40"
          dataSlot="skland-training-room"
          showEmblem={false}
        >
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<Activity className="size-4" aria-hidden="true" />}>
              训练室
            </OverviewTechnicalHeading>
            <p className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-[var(--room-accent)]">
              {infrastructure.training?.trainee ?? "当前空闲"}
            </p>
            <div className="mt-auto pt-4 text-xs leading-5 text-white/58">
            {infrastructure.training ? (
              <>
                <p className="font-number">技能 {infrastructure.training.skillIndex} · 协助：{infrastructure.training.trainer ?? "无"}</p>
                <p className="font-number">剩余 {formatDuration(infrastructure.training.remainSecs)} · 加速 {Math.round(infrastructure.training.speed * 100)}%</p>
              </>
            ) : "暂无训练任务"}
            </div>
          </div>
        </OverviewTechnicalCard>

        <OverviewTechnicalCard
          group="power"
          className="min-h-40"
          dataSlot="skland-infra-assets"
          showEmblem={false}
        >
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<Boxes className="size-4" aria-hidden="true" />}>
              基建资产
            </OverviewTechnicalHeading>
            <p className="mt-5 text-3xl font-semibold tabular-nums text-[var(--room-accent)]">
              {infrastructure.furnitureTotal}
              <span className="ml-1 text-sm font-normal text-white/58">件家具</span>
            </p>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-xs text-white/58">
              <span className="font-number">无人机 {infrastructure.labor.value}/{infrastructure.labor.maxValue}</span>
              <span className="font-number">低心情干员 {infrastructure.tiredOperators.length} 名</span>
            </div>
          </div>
        </OverviewTechnicalCard>

        {buildingMetrics.map((metric) => <BuildingMetricCard key={metric.id} metric={metric} />)}
      </section>

      {infrastructure.layoutWarning ? (
        <Alert>
          <AlertDescription className="font-number">{infrastructure.layoutWarning}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="skland-compact-layout-title">
        <div className="mb-3 flex min-w-0 items-end justify-between gap-3 border-b border-border/70 pb-3">
          <h3 id="skland-compact-layout-title" className="min-w-0 text-lg font-semibold tracking-[-0.025em]">
            当前基建
          </h3>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{infrastructure.rooms.length} 个设施</span>
        </div>

        <div
          className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,55fr)_minmax(19rem,45fr)]"
          data-skland-compact-layout
        >
          <div
            className={`flex min-w-0 flex-col gap-3 ${alignDenseInfrastructureRows ? "" : "xl:justify-between"}`}
            data-skland-compact-column="production"
          >
            {controlRooms.map((room) => <RoomCard key={room.key} room={room} />)}

            {workRooms.length ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {workRooms.map((room) => <RoomCard key={room.key} room={room} />)}
            </div> : null}

            {powerRooms.length ? <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {powerRooms.map((room) => <RoomCard key={room.key} room={room} />)}
            </div> : null}
          </div>

          <div
            className={`flex min-w-0 flex-col gap-3 ${alignDenseInfrastructureRows ? "skland-dense-auxiliary-column" : "xl:justify-between"}`}
            data-skland-compact-column="auxiliary"
          >
            {primaryFunctionRooms.length || secondaryFunctionRooms.length ? <div className="skland-auxiliary-grid min-w-0">
              <div className="skland-auxiliary-column skland-auxiliary-primary">
                {primaryFunctionRooms.map((room) => <RoomCard key={room.key} room={room} />)}
              </div>
              <div className="skland-auxiliary-column skland-auxiliary-secondary">
                {secondaryFunctionRooms.map((room) => <RoomCard key={room.key} room={room} />)}
              </div>
            </div> : null}

            {dormitoryRooms.map((room) => <RoomCard key={room.key} room={room} />)}
          </div>
        </div>
      </section>

    </div>
  );
}

function OperatorCard({ operator }: { operator: SklandOperatorStatus }) {
  return (
    <article className="[content-visibility:auto] [contain-intrinsic-size:16rem] border-t border-border/70 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="truncate font-medium">{operator.name}</h4>
            {operator.isAssist ? <Badge variant="secondary">助战</Badge> : null}
          </div>
          <p className="font-number mt-1 text-xs text-muted-foreground">
            {operator.rarity}★ · {professionLabel(operator.profession)} / {operator.subProfessionName}
          </p>
        </div>
        <Badge variant="outline" className="font-number">精 {operator.elite} Lv.{operator.level}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-muted-foreground">潜能</dt><dd className="font-number mt-0.5 font-medium">{operator.potential}</dd></div>
        <div><dt className="text-muted-foreground">信赖</dt><dd className="font-number mt-0.5 font-medium">{operator.favorPercent}%</dd></div>
        <div><dt className="text-muted-foreground">技能</dt><dd className="font-number mt-0.5 font-medium">Lv.{operator.mainSkillLevel}</dd></div>
      </dl>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-medium text-primary">专精、模组与皮肤</summary>
        <div className="mt-2 grid gap-1.5 leading-5 text-muted-foreground">
          <p className="font-number">
            专精：{operator.skills.length
              ? operator.skills.map((skill) => `S${skill.index} M${skill.specializeLevel}`).join(" · ")
              : "森空岛暂未提供"}
          </p>
          <p className="font-number">
            模组：{operator.modules.length
              ? operator.modules.map((module) => `${module.name} Lv.${module.level}${module.isDefault ? "（使用中）" : ""}`).join(" · ")
              : "无"}
          </p>
          <p>当前皮肤：{operator.currentSkinName ?? "默认服装"}</p>
          <p className="font-number">获得时间：{formatDate(operator.acquiredAt)}</p>
        </div>
      </details>
    </article>
  );
}

function SkinCard({ skin }: { skin: SklandOwnedSkin }) {
  return (
    <article className="[content-visibility:auto] border-t border-border/70 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-medium">{skin.name}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{skin.operatorName} · {skin.brandId}</p>
        </div>
        {skin.isCurrent ? <Badge variant="secondary">使用中</Badge> : null}
      </div>
      <p className="font-number mt-3 text-xs text-muted-foreground">获得于 {formatDate(skin.obtainedAt)}</p>
    </article>
  );
}

export function OperatorsTab({ snapshot }: { snapshot: SklandStatusSnapshot }) {
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState("all");
  const [profession, setProfession] = useState("all");
  const [operatorLimit, setOperatorLimit] = useState(INITIAL_LIST_LIMIT);
  const [skinLimit, setSkinLimit] = useState(INITIAL_LIST_LIMIT);
  const professions = useMemo(
    () => [...new Set(snapshot.operators.map((operator) => operator.profession))]
      .sort((left, right) => professionLabel(left).localeCompare(professionLabel(right), "zh-CN")),
    [snapshot.operators]
  );
  const professionOptions = useMemo(
    () => [
      { value: "all", label: "全部职业" },
      ...professions.map((value) => ({ value, label: professionLabel(value) })),
    ],
    [professions]
  );
  const filteredOperators = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return snapshot.operators
      .filter((operator) => !normalizedQuery || operator.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery))
      .filter((operator) => rarity === "all" || operator.rarity === Number(rarity))
      .filter((operator) => profession === "all" || operator.profession === profession)
      .sort((left, right) =>
        right.rarity - left.rarity
        || right.elite - left.elite
        || right.level - left.level
        || left.name.localeCompare(right.name, "zh-CN")
      );
  }, [profession, query, rarity, snapshot.operators]);
  const filteredSkins = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return snapshot.skins
      .filter((skin) =>
        !normalizedQuery
        || skin.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        || skin.operatorName.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
      )
      .sort((left, right) => right.obtainedAt - left.obtainedAt || left.name.localeCompare(right.name, "zh-CN"));
  }, [query, snapshot.skins]);

  function updateQuery(value: string) {
    setQuery(value);
    setOperatorLimit(INITIAL_LIST_LIMIT);
    setSkinLimit(INITIAL_LIST_LIMIT);
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-xl bg-muted/45 p-3 md:grid-cols-[minmax(0,1fr)_10rem_12rem]">
        <label className="relative">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            className="h-11 pl-9"
            placeholder="搜索干员或皮肤"
            aria-label="搜索干员或皮肤"
          />
        </label>
        <OperatorFilterCombobox
          label="星级"
          value={rarity}
          options={RARITY_OPTIONS}
          onValueChange={(value) => {
            setRarity(value);
            setOperatorLimit(INITIAL_LIST_LIMIT);
          }}
        />
        <OperatorFilterCombobox
          label="职业"
          value={profession}
          options={professionOptions}
          onValueChange={(value) => {
            setProfession(value);
            setOperatorLimit(INITIAL_LIST_LIMIT);
          }}
        />
      </div>

      <Tabs defaultValue="operators">
        <div className="overflow-x-auto pb-1">
          <TabsList variant="line" className="min-w-max">
            <TabsTrigger value="operators" className="h-10 px-4">
              <UsersRound />干员 <span className="font-number">{filteredOperators.length}</span>
            </TabsTrigger>
            <TabsTrigger value="skins" className="h-10 px-4">
              <Shirt />皮肤 <span className="font-number">{filteredSkins.length}</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="operators" className="pt-3">
          {filteredOperators.length ? (
            <>
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredOperators.slice(0, operatorLimit).map((operator) => (
                  <OperatorCard key={operator.id} operator={operator} />
                ))}
              </div>
              {operatorLimit < filteredOperators.length ? (
                <Button
                  type="button"
                  className="mt-6 h-11 w-full"
                  variant="outline"
                  onClick={() => setOperatorLimit((current) => current + INITIAL_LIST_LIMIT)}
                >
                  显示更多干员
                </Button>
              ) : null}
            </>
          ) : <p className="py-12 text-center text-sm text-muted-foreground">没有符合筛选条件的干员。</p>}
        </TabsContent>
        <TabsContent value="skins" className="pt-3">
          {filteredSkins.length ? (
            <>
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredSkins.slice(0, skinLimit).map((skin) => <SkinCard key={skin.id} skin={skin} />)}
              </div>
              {skinLimit < filteredSkins.length ? (
                <Button
                  type="button"
                  className="mt-6 h-11 w-full"
                  variant="outline"
                  onClick={() => setSkinLimit((current) => current + INITIAL_LIST_LIMIT)}
                >
                  显示更多皮肤
                </Button>
              ) : null}
            </>
          ) : <p className="py-12 text-center text-sm text-muted-foreground">森空岛暂未提供皮肤数据。</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProgressSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border/70 pt-5">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProgressTab({ snapshot }: { snapshot: SklandStatusSnapshot }) {
  const { player, progress } = snapshot;
  const now = useMinuteTimestamp(snapshot.infrastructure.currentTs);
  return (
    <div className="grid gap-7">
      <section className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <Card className="surface-shadow ring-0">
          <CardHeader>
            <CardDescription>博士档案</CardDescription>
            <CardTitle>{player.nickname}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-muted-foreground">注册时间</dt><dd className="font-number mt-1 font-medium">{formatDate(player.registerTs)}</dd></div>
              <div><dt className="text-muted-foreground">主线进度</dt><dd className="font-number mt-1 font-medium">{player.mainStageProgress ?? "未提供"}</dd></div>
              <div><dt className="text-muted-foreground">助理</dt><dd className="mt-1 font-medium">{player.secretary?.name ?? "未提供"}</dd></div>
              <div><dt className="text-muted-foreground">月卡到期</dt><dd className="font-number mt-1 font-medium">{formatDate(player.subscriptionEnd)}</dd></div>
            </dl>
            {player.resume ? <p className="border-t pt-3 leading-6 text-muted-foreground">{player.resume}</p> : null}
          </CardContent>
        </Card>
        <Card className="surface-shadow ring-0">
          <CardHeader>
            <CardDescription>收藏概况</CardDescription>
            <CardTitle className="font-number">
              {player.counts.operators === null ? "暂未提供" : `${player.counts.operators} 名干员`}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">皮肤</span><strong className="font-number mt-1 block text-lg">{player.counts.skins ?? "—"}</strong></div>
            <div><span className="text-muted-foreground">家具</span><strong className="font-number mt-1 block text-lg">{player.counts.furniture ?? "—"}</strong></div>
          </CardContent>
        </Card>
      </section>

      <ProgressSection title="公开招募" description="完成时间以本次森空岛存档为准。">
        {progress.recruit?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {progress.recruit.map((slot) => {
              const finished = slot.state === "completed"
                || (slot.state === "recruiting" && slot.finishTs > 0 && slot.finishTs <= now);
              const label = finished
                ? "已完成"
                : slot.state === "locked"
                  ? "未解锁"
                  : slot.state === "standby"
                    ? "空闲"
                    : "进行中";
              return (
                <div key={slot.index} className="rounded-lg bg-muted/45 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <strong className="font-number">槽位 {slot.index + 1}</strong>
                    <Badge variant={finished ? "secondary" : "outline"}>{label}</Badge>
                  </div>
                  <p className="font-number mt-2 text-xs text-muted-foreground">
                    {slot.finishTs > 0 ? formatDateTime(slot.finishTs) : "暂无计时"}
                  </p>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">森空岛暂未提供公招计时。</p>}
      </ProgressSection>

      <ProgressSection title="作战进度" description="剿灭、保全派驻与集成战略。">
        {progress.campaign || progress.tower || progress.rogue ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {progress.campaign ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><PackageCheck className="size-4" />剿灭作战</div>
                <ProgressMeter label="奖励进度" {...progress.campaign.reward} />
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  {progress.campaign.records.map((record) => (
                    <p key={`${record.zoneName}-${record.name}`} className="font-number">
                      {record.zoneName ? `${record.zoneName} · ` : ""}{record.name}：{record.maxKills}
                    </p>
                  ))}
                  {!progress.campaign.records.length ? <p>暂无记录</p> : null}
                </div>
              </div>
            ) : null}
            {progress.tower ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><Boxes className="size-4" />保全派驻</div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  {progress.tower.records.map((record) => (
                    <p key={`${record.name}-${record.subName}`} className="font-number">{record.name}{record.subName ? ` · ${record.subName}` : ""}：{record.best}</p>
                  ))}
                  {!progress.tower.records.length ? <p>暂无记录</p> : null}
                </div>
              </div>
            ) : null}
            {progress.rogue ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><DoorOpen className="size-4" />集成战略</div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  {progress.rogue.map((record) => (
                    <p key={record.name} className="font-number">{record.name}：藏品 {record.relicCount} · 银行 {record.bankCurrent}/{record.bankRecord}</p>
                  ))}
                  {!progress.rogue.length ? <p>暂无记录</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : <p className="text-sm text-muted-foreground">森空岛暂未提供作战进度。</p>}
      </ProgressSection>

      <ProgressSection title="活动记录" description="只展示森空岛返回的关卡完成情况，不加载活动宣传链接。">
        {progress.activities?.length || progress.bossRush?.length ? (
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
            {(progress.activities ?? []).map((activity) => (
              <article key={`${activity.name}-${activity.startTime}`} className="border-t border-border/70 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <strong>{activity.name}</strong>
                  {activity.isReplicate ? <Badge variant="outline">复刻</Badge> : null}
                </div>
                <p className="font-number mt-2 text-xs text-muted-foreground">
                  关卡 {activity.clearedStages}/{activity.totalStages} · 至 {formatDate(activity.endTime)}
                </p>
              </article>
            ))}
            {(progress.bossRush ?? []).map((record, index) => (
              <article key={`${record.stageCode}-${index}`} className="border-t border-border/70 pt-3">
                <strong className="font-number">{record.stageCode ?? "首领活动"} {record.stageName ?? ""}</strong>
                <p className="font-number mt-2 text-xs text-muted-foreground">
                  {record.played ? "已有记录" : "尚未挑战"} · {record.difficulty}
                </p>
              </article>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">森空岛暂未提供活动记录。</p>}
      </ProgressSection>
    </div>
  );
}

function LoadingState() {
  return (
    <StatusCenterPage data-skland-page>
      <StatusCenterLoading label="正在恢复森空岛会话" />
    </StatusCenterPage>
  );
}

export function SklandStatus({
  scheduleSnapshot,
  snapshot,
  accounts,
  activeAccountId,
  bindingCount,
  bindingSummary,
  sessionLoading,
  layoutMatches,
  layoutDirty,
  configured,
  disabledReason,
  busy,
  error,
  onAuthenticated,
  onRoleChange,
  onLogout,
  onRetryStatus,
  onDeleteAllData,
  onApplyLayout,
  onContinueSetup,
  onOpenCalculator,
  onCopyUid,
}: SklandStatusProps) {
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [accountQuery, setAccountQuery] = useState<string | null>(null);
  const bindingState = deriveSklandBindingState(bindingSummary, accounts.length);
  if (sessionLoading) return <LoadingState />;

  if (!scheduleSnapshot) {
    const loginTitle = bindingState === "renewal-due"
      ? "七天授权期已结束，请扫码续期"
      : bindingState === "reauthorize"
        ? "森空岛已绑定，请授权当前浏览器"
        : "把当前罗德岛带进排班助手";
    const loginDescription = bindingState === "renewal-due"
      ? `最近一次授权${bindingSummary.latestExpiredAt
        ? `已于 ${credentialExpiryLabel(bindingSummary.latestExpiredAt)} 到期`
        : "已经到期"}。重新扫码即可继续同步，现有排班设置不会被清除。`
      : bindingState === "reauthorize"
        ? `网站账号仍保留 ${bindingCount} 个森空岛绑定，但当前浏览器没有可用凭证。重新扫码即可继续同步。`
        : "使用森空岛 App 扫描二维码，同步当前角色的干员与基建数据。";
    return (
      <StatusCenterPage
        className="min-h-[calc(100dvh-7rem)] place-items-center py-8 sm:py-12"
        data-skland-page
      >
        <div className="grid w-full max-w-xl justify-items-center gap-7 text-center">
          <header className="grid max-w-lg gap-3" data-skland-login-copy>
            <p className="text-xs font-medium tracking-wide text-primary">森空岛状态中心</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{loginTitle}</h2>
            <p className="text-pretty text-sm leading-6 text-muted-foreground">{loginDescription}</p>
            <p className="text-xs leading-5 text-muted-foreground/80">
              登录凭证只保存在当前浏览器，7 天后失效。
            </p>
          </header>
          {error ? (
            <Alert className="w-full max-w-lg text-start" variant="destructive">
              <AlertDescription>{error.message}（{error.code}）</AlertDescription>
            </Alert>
          ) : null}
          <SklandLoginPanel
            className="max-w-lg"
            configured={configured}
            disabledReason={disabledReason}
            onAuthenticated={onAuthenticated}
          />
        </div>
      </StatusCenterPage>
    );
  }

  const activeAccount = accounts.find((account) => account.accountId === activeAccountId) ?? accounts[0] ?? null;
  const activeRole = activeAccount?.roles.find((role) => role.uid === activeAccount.selectedUid) ?? activeAccount?.roles[0] ?? null;

  if (!snapshot && activeAccount) {
    if (!error) return <LoadingState />;
    return (
      <StatusCenterPage data-skland-page data-skland-status-load-error>
        <header className="max-w-2xl">
          <p className="text-xs font-medium tracking-wide text-primary">森空岛状态中心</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">完整状态暂时无法加载</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            当前已登录{activeRole ? `“${activeRole.nickname}”` : "森空岛"}。你可以重新加载，或退出当前账号后重新扫码。
          </p>
        </header>
        <Alert variant="destructive"><AlertDescription>{error.message}（{error.code}）</AlertDescription></Alert>
        <Card>
          <CardHeader>
            <CardTitle>重新加载状态中心</CardTitle>
            <CardDescription className="max-w-2xl leading-6">
              登录后会按隐私政策列明的范围读取并展示完整状态；完整快照只保留在当前页面内存中。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={onRetryStatus}>重新加载状态中心</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void onLogout()}>
              <LogOut />退出当前账号
            </Button>
          </CardContent>
        </Card>
        <SklandDataControls
          account={activeAccount}
          busy={busy}
          onDeleteAllData={onDeleteAllData}
        />
      </StatusCenterPage>
    );
  }

  if (!snapshot || !activeAccount) return <LoadingState />;

  const selectionGroups = accounts.map((account, accountIndex) => {
    const selectedRole = account.roles.find((role) => role.uid === account.selectedUid) ?? account.roles[0];
    return {
      value: account.accountId,
      label: `森空岛账号 ${accountIndex + 1}${selectedRole ? ` · ${selectedRole.nickname}` : ""}`,
      items: account.roles.map((role) => ({
        value: `${account.accountId}:${role.uid}`,
        label: `${role.nickname} · ${role.channelName}`,
        accountId: account.accountId,
        uid: role.uid,
      })),
    };
  });
  const selectionItems = selectionGroups.flatMap((group) => group.items);
  const selectedValue = activeAccountId ? `${activeAccountId}:${snapshot.player.uid}` : "";
  const selectedItem = selectionItems.find((item) => item.value === selectedValue) ?? null;

  return (
    <StatusCenterPage className="pb-0 sm:pb-0" data-skland-page>
      <StatusCenterHeader
        data-ui-number-font
        identity={(
          <div className="flex min-w-0 items-center gap-4">
            <RemoteAvatar
              src={snapshot.player.avatarUrl}
              alt={`${snapshot.player.nickname}的森空岛头像`}
              pixelSize={56}
              className="size-14 rounded-xl ring-1 ring-foreground/10"
              imageClassName="rounded-xl"
              loadingFallback={<Skeleton className="size-full rounded-xl" />}
              emptyFallback={(
                <div
                className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground"
                role="img"
                aria-label={`${snapshot.player.nickname}的森空岛头像`}
              >
                {snapshot.player.nickname.slice(0, 1)}
                </div>
              )}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-semibold tracking-tight">{snapshot.player.nickname}</h2>
                {snapshot.player.level !== null ? <Badge variant="secondary">Lv.{snapshot.player.level}</Badge> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{snapshot.player.channelName}</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  onClick={() => onCopyUid(snapshot.player.uid)}
                  aria-label="复制完整 UID"
                >
                  UID {maskedUid(snapshot.player.uid)} <Clipboard className="size-3" />
                </button>
                <span>同步于 {formatDateTime(snapshot.infrastructure.storeTs)}</span>
              </div>
            </div>
          </div>
        )}
        actions={(
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <div
              className="col-span-2 h-11 w-full sm:w-56"
            data-skland-account-select
          >
            <Combobox
              items={selectionGroups}
              value={selectedItem}
              inputValue={accountQuery ?? selectedItem?.label ?? ""}
              disabled={busy}
              itemToStringValue={(item) => item.label}
              isItemEqualToValue={(item, current) => item.value === current.value}
              filter={(item, query) => item.label.toLocaleLowerCase("zh-CN").includes(query.trim().toLocaleLowerCase("zh-CN"))}
              autoHighlight
              onInputValueChange={(inputValue) => setAccountQuery(inputValue)}
              onOpenChange={(open) => {
                if (!open) setAccountQuery(null);
              }}
              onValueChange={(selection) => {
                if (selection && selection.value !== selectedValue) {
                  setAccountQuery(null);
                  void onRoleChange(selection.accountId, selection.uid);
                }
              }}
            >
              <ComboboxInput
                className="h-full w-full"
                aria-label="选择账号与角色"
                placeholder="搜索账号与角色"
              />
              <ComboboxContent>
                <ComboboxEmpty>没有匹配的账号或角色</ComboboxEmpty>
                <ComboboxList>
                  {(group, groupIndex) => (
                    <ComboboxGroup key={group.value} items={group.items}>
                      {groupIndex > 0 ? <ComboboxSeparator /> : null}
                      <ComboboxLabel>{group.label}</ComboboxLabel>
                      <ComboboxCollection>
                        {(item) => (
                          <ComboboxItem key={item.value} value={item}>
                            {item.label}
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                    </ComboboxGroup>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
            <Button
              type="button"
              className="h-11"
            variant="outline"
            disabled={busy || accounts.length >= 5}
            title={accounts.length >= 5 ? "最多可登录 5 个森空岛账号" : undefined}
            onClick={() => setAddAccountOpen(true)}
            data-skland-add-account
          >
            <UserPlus />添加账号
            </Button>
            <Button
              type="button"
              className="h-11"
            variant="destructive"
            disabled={busy}
            onClick={() => void onLogout()}
            data-skland-logout
          >
            <LogOut />退出
            </Button>
          </div>
        )}
      />

      <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[min(880px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>添加森空岛账号</DialogTitle>
            <DialogDescription>
              扫码后会保留现有账号，并将新账号设为当前账号。最多同时登录 <span className="font-number">5</span> 个账号。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0 overflow-y-auto pb-5 pt-0 sm:pb-7">
            <SklandLoginPanel
              className="max-w-none"
              configured={configured}
              disabledReason={disabledReason}
              dialogPresentation
              onAuthenticated={(session) => {
                onAuthenticated(session);
                setAddAccountOpen(false);
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error.message}（{error.code}）。已保留上一次成功同步的数据。
          </AlertDescription>
        </Alert>
      ) : null}

      {bindingSummary.renewalDueCount > 0 ? (
        <Alert>
          <AlertDescription data-ui-number-font>
            有 {bindingSummary.renewalDueCount} 个森空岛绑定已满七天，需要重新扫码续期。当前仍有效的账号可以继续使用。
          </AlertDescription>
        </Alert>
      ) : null}

      {snapshot.warnings.length ? (
        <Alert>
          <AlertDescription className="font-number">
            {snapshot.warnings.join(" ")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="overview">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3" data-skland-view-header>
          <div className="-mx-3 min-w-0 overflow-x-auto overflow-y-hidden px-3 pb-1">
            <TabsList className="min-w-max" data-skland-view-tabs>
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="infrastructure">基建</TabsTrigger>
            </TabsList>
          </div>
          <LayoutSyncControl
            snapshot={snapshot}
            layoutMatches={layoutMatches}
            layoutDirty={layoutDirty}
            onApplyLayout={onApplyLayout}
          />
        </div>
        <TabsContent value="overview" className="pt-5">
          <OverviewTab snapshot={snapshot} onContinueSetup={onContinueSetup} onOpenCalculator={onOpenCalculator} />
        </TabsContent>
        <TabsContent value="infrastructure" className="pt-5">
          <InfrastructureTab snapshot={snapshot} />
        </TabsContent>
      </Tabs>

      <SklandDataControls
        account={activeAccount}
        busy={busy}
        onDeleteAllData={onDeleteAllData}
      />
    </StatusCenterPage>
  );
}
