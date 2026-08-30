import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Smile,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CSSProperties, ChangeEvent, lazy, ReactElement, ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";

import { AnimatedNumber, AnimatedText } from "@/components/AnimatedText";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { loadClientFeature } from "@/client-lazy-loader";
import {
  BUILDING_SKILL_ENHANCED_WORD,
  buildingSkillUnlockLabel,
  buildingSkillUnlockPrefix,
  operatorProfessionPresentationForCode,
} from "@/operator-presentation";
import { roomVisualFor } from "@/room-visuals";
import {
  MOTION_DURATION,
  MOTION_EASE_IN_OUT,
  MOTION_EASE_OUT,
  type ShiftDirection,
} from "@/motion";

export { roomVisualFor } from "@/room-visuals";

import {
  FACTORY_RECIPE_OPTIONS,
  FactoryRecipe,
  TRADE_ORDER_OPTIONS,
  TradeOrder,
  factoryRecipeFor,
  maxRoomLevel,
  productLabel,
  roomKindLabel,
  tradeOrderFor,
} from "./blueprint";
import { manufacturePoolReady, presentRoomEfficiency, profileEfficiency, RoomEfficiencyPresentation } from "./efficiency";
import {
  relativeMetricDelta,
  rotationMetricValue,
  shiftTabLabel,
  shiftTeamSummary,
  type RotationMetricKind,
} from "./rotation-presentation";
import { DEFAULT_ROTATION_PROFILE, rotationOption } from "./rotation-settings";
import { RoomRow } from "./schedule";
import {
  COMPACT_OPERATOR_SIZE_CLASS,
  LevelDiamondVariant,
  OPERATOR_NAME_SIZE_CLASS,
  levelDiamondCount,
  roomGridTone,
} from "./schedule-view-presentation";
import {
  buildListScheduleGroups,
  isListFunctionalFacilityRoom,
  listFunctionalFacilityGridClass,
  listFunctionalOperatorPosition,
  listFunctionalOperatorPlacementClass,
  listFunctionalRoomSpanClass,
  listMobileOperatorGridClass,
  listRoomHeightClass,
  listRoomTitleSizeClass,
  listRoomUsesAlignedOperatorOrigin,
} from "./schedule-list-layout";
import {
  BaseBlueprint,
  FeedbackKind,
  MaaJson,
  MaaPlan,
  PresetDef,
  RotationJson,
  UserProfile,
} from "./types";

const OperatorSkillTooltip = lazy(() => loadClientFeature("operatorSkillTooltip").then((module) => ({
  default: module.OperatorSkillTooltip,
})));

function CompactScheduleLoading() {
  return (
    <div
      className="grid min-h-[560px] place-items-center border-y border-dashed border-border/70 text-sm text-muted-foreground"
      data-compact-schedule-loading
      role="status"
    >
      正在准备一图流布局
    </div>
  );
}

type ScheduleViewMode = "list" | "compact";
type CompactScheduleComponent = typeof import("@/components/CompactScheduleView").CompactScheduleView;

type Option<T extends string> = {
  value: T;
  label: ReactNode;
};

export function ProductToggleGroup<T extends string>({
  value,
  options,
  onChange,
  columns,
  tone = "default",
  surface = "default",
  layout = "compact",
  ariaLabel,
  disabledValue,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  columns: 2 | 3 | 4;
  tone?: "default" | "trade" | "factory";
  surface?: "default" | "room";
  layout?: "compact" | "fill";
  ariaLabel: string;
  disabledValue?: T;
}) {
  const roomProductControls = surface === "room" && (tone === "trade" || tone === "factory");
  const compactRoomProductControls = roomProductControls && layout === "compact";
  const fillRoomProductControls = roomProductControls && layout === "fill";

  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(nextValue) => {
        const next = nextValue[0] as T | undefined;
        if (next) onChange(next);
      }}
      spacing={1}
      className={cn(
        "grid",
        compactRoomProductControls
          ? tone === "factory"
            ? "w-full grid-cols-3 gap-x-2 gap-y-2.5 sm:w-fit sm:grid-cols-[repeat(2,90px)]"
            : "w-fit grid-cols-[repeat(2,70px)] gap-x-2 gap-y-2.5 sm:grid-cols-[repeat(2,90px)]"
          : cn(
              "w-full",
              fillRoomProductControls && "gap-x-2 gap-y-2.5",
              columns === 4 ? "grid-cols-4 sm:grid-cols-2" : columns === 2 ? "grid-cols-2" : "grid-cols-3"
            )
      )}
    >
      {options.map((option) => {
        const disabled = option.value === disabledValue;
        const isOriginiumTrade = tone === "trade" && option.value === "originium";
        const isOriginiumRecipe = tone === "factory" && option.value === "originium";
        const isBattleRecordRecipe = tone === "factory" && option.value === "battle_record";

        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            disabled={disabled}
            size="sm"
            variant="outline"
            className={cn(
              "min-w-0 px-2 text-xs",
              surface === "room" && "infra-room-control",
              surface === "default" && "min-h-10",
              compactRoomProductControls && "max-w-[90px] max-sm:max-w-[70px]",
              compactRoomProductControls && tone === "factory" && "w-full",
              fillRoomProductControls && "w-full",
              tone === "trade" && "product-toggle-trade",
              tone === "factory" && "product-toggle-factory",
              (isOriginiumTrade || isOriginiumRecipe) && "product-toggle-originium",
              isBattleRecordRecipe && "product-toggle-battle-record"
            )}
          >
            {option.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export function Panel({
  title,
  icon,
  children,
  className = "",
  action,
  description,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <section className={cn("min-w-0 py-5", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        {title || icon || description ? (
          <div className="flex min-w-0 items-start gap-2">
            {icon ? <div className="mt-0.5 text-primary">{icon}</div> : null}
            <div className="min-w-0">
              {title ? <h2 className="text-sm font-semibold tracking-tight">{title}</h2> : null}
              {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
            </div>
          </div>
        ) : null}
        {action ? (
          <div className={cn("ms-auto min-w-0 max-sm:w-full", !title && !icon && !description && "w-full")}>
            {action}
          </div>
        ) : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

export function FileDrop({
  fileName,
  onFile,
}: {
  fileName: string | null;
  onFile: (file: File) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.currentTarget.value = "";
  }

  return (
    <Label pressable className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-[4px] border border-dashed bg-background px-4 py-5 text-center transition-[color,background-color,border-color] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:border-primary/40 hover:bg-muted/40">
      <Upload className="size-5 text-primary" />
      <span className="font-medium text-foreground">{fileName ?? "上传练度 JSON / XLSX"}</span>
      <span className="text-xs text-muted-foreground">
        支持 MAA 导出的干员数据 JSON，也支持一图流 XLSX
      </span>
      <input className="sr-only" type="file" accept=".json,.xlsx,.xls" onChange={handleChange} />
    </Label>
  );
}

export function PresetSelector({
  presets,
  selected,
  onSelect,
}: {
  presets: PresetDef[];
  selected: PresetDef;
  onSelect: (preset: PresetDef) => void;
}) {
  return (
    <ToggleGroup
      aria-label="布局预设"
      value={[selected.label]}
      onValueChange={(nextValue) => {
        const next = presets.find((preset) => preset.label === nextValue[0]);
        if (next) onSelect(next);
      }}
      spacing={2}
      className="grid w-full grid-cols-2 gap-2 rounded-none sm:grid-cols-3 lg:grid-cols-5"
    >
      {presets.map((preset) => (
        <ToggleGroupItem
          key={preset.label}
          value={preset.label}
          variant="outline"
          className={cn(
            "infra-preset-surface group/preset relative isolate h-auto min-h-18 justify-between overflow-hidden rounded-none border border-white/10 bg-[#272A2B] px-3 py-3 text-left text-white transition-[background-color,border-color] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:border-white/22 hover:bg-[#303435] hover:text-white",
            selected.label === preset.label && "border-[#FFD800]/72 bg-[#303027] text-white hover:border-[#FFD800]/82 hover:bg-[#343329] hover:text-white"
          )}
        >
          <span
            className={cn(
              "absolute left-3 top-0 h-0.5 w-9 bg-[#FFD800] transition-opacity duration-150",
              selected.label === preset.label ? "opacity-100" : "opacity-0"
            )}
            aria-hidden="true"
          />
          <span className="relative z-10 flex min-w-0 flex-col items-start gap-1">
            <span className="text-lg font-semibold leading-none tabular-nums">{preset.label}</span>
            <span className="text-xs font-normal text-white/58">
              <span className="font-number">{preset.trading}</span> 贸 / <span className="font-number">{preset.manufacture}</span> 制 / <span className="font-number">{preset.power}</span> 电
            </span>
          </span>
          {selected.label === preset.label ? <Check className="relative z-10 size-4 shrink-0 text-[#FFD800]" aria-hidden="true" /> : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function RoomLevelControl({
  roomId,
  level,
  levelMax,
  onChange,
  surface = "default",
}: {
  roomId: string;
  level: number;
  levelMax: number;
  onChange: (level: number) => void;
  surface?: "default" | "room";
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(level);

  const commit = (raw: string) => {
    const n = Number(raw.trim());
    const next = Number.isInteger(n) ? Math.max(1, Math.min(levelMax, n)) : level;
    if (next !== level) onChange(next);
    setDraft(null);
  };

  const levelOptions = Array.from({ length: levelMax }, (_, i) => String(i + 1));

  return (
    <>
      {/* PC：左右箭头 + 中间可输入 */}
      <div className={cn(
        "hidden h-10 w-20 items-center overflow-hidden rounded-[4px] border sm:flex",
        surface === "room" ? "border-white/20 bg-[#3C3C3C]/78" : "border-input"
      )}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${roomId} 等级减一`}
          className={cn(
            "h-full w-7 rounded-none",
            surface === "room" ? "text-white/62 hover:bg-white/10 hover:text-white disabled:text-white/28" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          disabled={level <= 1}
          onClick={() => {
            setDraft(null);
            onChange(Math.max(1, level - 1));
          }}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <Input
          type="text"
          inputMode="numeric"
          aria-label={`${roomId} 等级`}
          value={display}
          onFocus={() => setDraft(String(level))}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className={cn(
            "h-full w-12 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-center text-sm tabular-nums focus-visible:ring-0",
            surface === "room" && "text-white caret-white"
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${roomId} 等级加一`}
          className={cn(
            "h-full w-7 rounded-none",
            surface === "room" ? "text-white/62 hover:bg-white/10 hover:text-white disabled:text-white/28" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          disabled={level >= levelMax}
          onClick={() => {
            setDraft(null);
            onChange(Math.min(levelMax, level + 1));
          }}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>

      {/* 移动端：Combobox 选择 + 输入 */}
      <div className="sm:hidden">
        <Combobox
          items={levelOptions}
          value={String(level)}
          onValueChange={(value) => {
            const next = Number(value);
            if (Number.isInteger(next) && next >= 1 && next <= levelMax && next !== level) onChange(next);
          }}
          itemToStringValue={(item) => item}
        >
          <ComboboxInput
            aria-label={`${roomId} 等级`}
            className={cn(
              "w-20 rounded-[4px] [&_[data-slot=input-group-control]]:text-center",
              surface === "room" && "border-white/20 bg-[#3C3C3C]/78 text-white shadow-none [&_[data-slot=input-group-button]]:text-white/62 [&_[data-slot=input-group-control]]:text-white"
            )}
            inputMode="numeric"
            pattern="[0-9]*"
            onBlur={(event) => {
              const raw = event.currentTarget.value;
              if (raw) {
                const n = Number(raw);
                const next = Number.isInteger(n) ? Math.max(1, Math.min(levelMax, n)) : level;
                if (next !== level) onChange(next);
              }
            }}
          />
          <ComboboxContent align="start">
            <ComboboxList>
              {(item) => (
                <ComboboxItem key={item} value={item} className="font-number justify-center text-center">
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    </>
  );
}

function roomVisualGroupForKind(kind: BaseBlueprint["rooms"][number]["kind"]): string {
  if (kind === "trade_post") return "trading";
  if (kind === "factory") return "manufacture";
  if (kind === "power_plant") return "power";
  if (kind === "control_center") return "control";
  if (kind === "dormitory") return "dormitory";
  if (kind === "meeting_room") return "meeting";
  if (kind === "workshop") return "processing";
  if (kind === "training_room") return "training";
  if (kind === "office") return "hire";
  return "default";
}

export function LayoutEditor({
  layout,
  onFactoryRecipeChange,
  onTradeOrderChange,
  onRoomLevelChange,
}: {
  layout: BaseBlueprint;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
  onRoomLevelChange: (roomId: string, level: number) => void;
}) {
  const roomGroups = [
    { key: "trade", label: "贸易站", rooms: layout.rooms.filter((room) => room.kind === "trade_post") },
    { key: "factory", label: "制造站", rooms: layout.rooms.filter((room) => room.kind === "factory") },
    { key: "power", label: "发电站", rooms: layout.rooms.filter((room) => room.kind === "power_plant") },
    { key: "function", label: "控制与功能区", rooms: layout.rooms.filter((room) => !["trade_post", "factory", "power_plant", "dormitory"].includes(room.kind)) },
    { key: "dormitory", label: "宿舍", rooms: layout.rooms.filter((room) => room.kind === "dormitory") },
  ].filter((group) => group.rooms.length > 0);

  return (
    <Accordion multiple defaultValue={["trade", "factory"]} aria-label="设施设置" className="gap-2.5">
      {roomGroups.map((group) => (
        <AccordionItem key={group.key} value={group.key} data-facility-group={group.key}>
          <AccordionTrigger>
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <span>{group.label}</span>
              <span className="text-xs font-normal tabular-nums text-muted-foreground">{group.rooms.length}</span>
            </span>
          </AccordionTrigger>
          <AccordionPanel>
            <div className="divide-y divide-border/70">
            {group.rooms.map((room, roomIndex) => {
              const isTrade = room.kind === "trade_post";
              const isFactory = room.kind === "factory";
              const activeOrder = isTrade ? tradeOrderFor(room) : null;
              const activeRecipe = isFactory ? factoryRecipeFor(room) : null;
              const activeProduct = activeOrder ?? activeRecipe;
              const hasRestrictedProduct = room.level < 3;
              const restrictionHint = isTrade ? "开采协力仅限 3 级贸易站" : "源石碎片仅限 3 级制造站";
              const availableProductOptions: Option<TradeOrder | FactoryRecipe>[] = isTrade
                ? TRADE_ORDER_OPTIONS
                : isFactory
                  ? FACTORY_RECIPE_OPTIONS
                  : [];
              const product = productLabel(room);
              const levelMax = maxRoomLevel(room.kind);
              const visualGroup = roomVisualGroupForKind(room.kind);
              const displayName = group.rooms.length > 1
                ? `${roomKindLabel(room.kind)} ${roomIndex + 1}`
                : roomKindLabel(room.kind);

              return (
                <div
                  key={room.id}
                  data-slot="setup-room-row"
                  data-room-group={visualGroup}
                  className={cn(
                    "grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-4 py-3",
                    (isTrade || isFactory) && "sm:grid-cols-[minmax(8rem,1fr)_auto_minmax(18rem,1.4fr)]"
                  )}
                >
                  <div className="min-w-0">
                    <span className="font-number block truncate text-sm font-medium text-foreground">{displayName}</span>
                    {!isTrade && !isFactory && product ? (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{product}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden="true">Lv.</span>
                    <RoomLevelControl
                      roomId={room.id}
                      level={room.level}
                      levelMax={levelMax}
                      onChange={(level) => onRoomLevelChange(room.id, level)}
                    />
                  </div>

                  {activeProduct ? (
                    <div className="col-span-2 sm:col-span-1">
                      <ProductToggleGroup<TradeOrder | FactoryRecipe>
                        ariaLabel={`${room.id} ${isTrade ? "订单" : "配方"}${hasRestrictedProduct ? `，${restrictionHint}` : ""}`}
                        value={activeProduct}
                        options={availableProductOptions}
                        columns={isTrade ? 2 : 3}
                        tone={isTrade ? "trade" : "factory"}
                        layout="fill"
                        disabledValue={hasRestrictedProduct ? "originium" : undefined}
                        onChange={(nextProduct) => {
                          if (isTrade) onTradeOrderChange(room.id, nextProduct as TradeOrder);
                          else onFactoryRecipeChange(room.id, nextProduct as FactoryRecipe);
                        }}
                      />
                      {hasRestrictedProduct ? <p className="mt-1.5 text-xs text-muted-foreground">{restrictionHint}。</p> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            </div>
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function RunButton({
  canRun,
  loading,
  plannerReady,
  onRun,
}: {
  canRun: boolean;
  loading: boolean;
  plannerReady: boolean;
  onRun: () => void;
}) {
  const unavailableLabel = plannerReady ? "请先导入干员数据" : "排班服务暂不可用";
  return (
    <Button
      size="sm"
      className="h-9 min-w-0 max-sm:h-11 max-sm:px-3 max-sm:text-xs"
      aria-label={loading ? "计算中" : canRun ? "生成排班" : unavailableLabel}
      title={!canRun ? (plannerReady ? "请先导入干员数据。" : "排班服务暂不可用，请稍后重试。") : undefined}
      onClick={onRun}
      disabled={!canRun || loading}
    >
      {loading ? <Loader2 className="animate-spin" /> : <Play />}
      <span>{loading ? "计算中" : canRun ? "生成排班" : "导入后生成"}</span>
    </Button>
  );
}

export function ShiftTabs({
  maaJson,
  rotation,
  active,
  closest,
  onChange,
}: {
  maaJson?: MaaJson;
  rotation?: RotationJson;
  active: number;
  closest?: number;
  onChange: (index: number) => void;
}) {
  const plans = maaJson?.plans ?? [];

  if (plans.length === 0) {
    return (
      <Button type="button" variant="outline" disabled size="sm">
        等待结果
      </Button>
    );
  }

  return (
    <Tabs value={String(active)} onValueChange={(value) => onChange(Number(value))} className="max-w-full">
      <TabsList
        className="max-w-full justify-start overflow-x-auto overflow-y-hidden tracking-[0.01em] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-shift-tabs
        data-ui-number-font
      >
        {plans.map((plan, index) => {
          const shift = rotation?.shifts[index];
          const label = shiftTabLabel(shift, index);
          const teamSummary = shiftTeamSummary(shift, rotation?.profile ?? DEFAULT_ROTATION_PROFILE);
          return (
            <TabsTrigger
              key={`${plan.name}-${index}`}
              value={String(index)}
              aria-label={teamSummary ? `${label}，${teamSummary}` : label}
            >
              {label}
              {closest === index ? <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary max-md:hidden">最接近</span> : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

function compactNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.?0+$/, "");
}

function profileSeverityClass(severity: "ok" | "warn" | "critical") {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "warn") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export function PlanTelemetry({
  profile,
  rotation,
  layout,
  activeShift,
  planRevision,
}: {
  profile?: UserProfile;
  rotation?: RotationJson;
  layout: BaseBlueprint;
  activeShift: number;
  planRevision?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  if (!profile && !rotation) return null;

  const active = rotation?.shifts?.[activeShift];
  const rotationProfile = rotation?.profile ?? profile?.rotation_profile ?? DEFAULT_ROTATION_PROFILE;
  const selectedRotation = rotationOption(rotationProfile);
  const activeTeamSummary = shiftTeamSummary(active, rotationProfile);
  const summary = profile?.summary;
  const manufactureReady = summary ? manufacturePoolReady(summary) : undefined;
  const currentProfileRotation = profile?.rotation;
  const baselineProfileRotation = profile?.baseline_rotation;
  const dailyMetrics = [
    {
      kind: "trade" as const,
      label: "24h 贸易",
      value: rotation?.daily.trade ?? currentProfileRotation?.daily_trade_efficiency ?? currentProfileRotation?.daily_trade,
      baseline: baselineProfileRotation?.daily_trade_efficiency ?? baselineProfileRotation?.daily_trade,
      suffix: "×",
    },
    {
      kind: "manu" as const,
      label: "24h 制造",
      value: rotation?.daily.manufacture ?? currentProfileRotation?.daily_manufacture_efficiency ?? currentProfileRotation?.daily_manu,
      baseline: baselineProfileRotation?.daily_manufacture_efficiency ?? baselineProfileRotation?.daily_manu,
      suffix: "%",
    },
    {
      kind: "power" as const,
      label: "24h 发电",
      value: rotation?.daily.power ?? currentProfileRotation?.daily_power_efficiency ?? currentProfileRotation?.daily_power,
      baseline: baselineProfileRotation?.daily_power_efficiency ?? baselineProfileRotation?.daily_power,
      suffix: "%",
    },
  ].filter((metric): metric is {
    kind: RotationMetricKind;
    label: string;
    value: number;
    baseline: number | undefined;
    suffix: string;
  } => typeof metric.value === "number");
  const domains = profile?.domains ?? [];

  return (
    <motion.section
      className="mb-4 overflow-hidden border-y border-[#313131]/15 bg-[#F3F1EA]"
      aria-label="效率概览"
      data-plan-summary
      data-plan-revision={planRevision}
      initial={{
        opacity: 0,
        y: shouldReduceMotion ? 0 : 8,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      exit={{
        opacity: 0,
        y: shouldReduceMotion ? 0 : -4,
      }}
      transition={{
        duration: shouldReduceMotion ? MOTION_DURATION.feedback : MOTION_DURATION.emphasis,
        delay: shouldReduceMotion ? 0 : 0.06,
        ease: MOTION_EASE_OUT,
      }}
    >
      <div className="grid grid-cols-[auto_1fr] items-stretch max-md:grid-cols-1">
        <div className="flex min-w-36 flex-col justify-center bg-[#313131] px-4 py-3 text-white">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">效率概览</span>
          <strong className="mt-0.5 text-xl font-medium">当前方案</strong>
          <span className="mt-1 text-xs text-white/62">
            <span className="font-number">{layout.template}</span> · <span className="font-number">{layout.rooms.length}</span> 个设施
          </span>
          <span className="mt-0.5 text-xs text-white/62">
            {selectedRotation.label} · <span className="font-number">{rotation?.shifts.length ?? 0}</span> 班
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] divide-x divide-[#313131]/10 max-sm:divide-x-0 max-sm:grid-cols-2">
          {dailyMetrics.map((metric, metricIndex) => {
            const value = rotationMetricValue(metric.kind, metric.value);
            const displayDigits = metric.kind === "trade" ? 3 : 1;
            const baseline = typeof metric.baseline === "number"
              ? rotationMetricValue(metric.kind, metric.baseline)
              : undefined;
            const delta = typeof metric.baseline === "number"
              ? relativeMetricDelta(metric.value, metric.baseline)
              : undefined;
            return (
              <motion.div
                key={metric.label}
                className="px-4 py-3"
                data-plan-metric
                initial={{
                  opacity: 0,
                  y: shouldReduceMotion ? 0 : 4,
                }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: shouldReduceMotion ? MOTION_DURATION.feedback : MOTION_DURATION.content,
                  delay: shouldReduceMotion ? 0 : 0.06 + metricIndex * 0.045,
                  ease: MOTION_EASE_OUT,
                }}
              >
                <span className="font-number block text-xs text-[#313131]/58">{metric.label}</span>
                <strong className="font-technical mt-0.5 block text-lg font-semibold tabular-nums tracking-[0.01em] text-[#313131]">
                  <AnimatedNumber value={`${compactNumber(value, displayDigits)}${metric.suffix}`} />
                </strong>
                <span className="mt-0.5 block whitespace-nowrap text-[10px] tabular-nums text-[#313131]/52">
                  参考 {baseline === undefined ? "—" : `${compactNumber(baseline, displayDigits)}${metric.suffix}`}
                  {delta === undefined ? null : (
                    <span className={cn("ml-1", delta >= 0 ? "text-emerald-700" : "text-red-700")}>
                      · {delta >= 0 ? "+" : ""}{compactNumber(delta)}%
                    </span>
                  )}
                </span>
              </motion.div>
            );
          })}
          {active ? (
            <motion.div
              className="px-4 py-3"
              data-plan-metric
              initial={{
                opacity: 0,
                y: shouldReduceMotion ? 0 : 4,
              }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: shouldReduceMotion ? MOTION_DURATION.feedback : MOTION_DURATION.content,
                delay: shouldReduceMotion ? 0 : 0.06 + dailyMetrics.length * 0.045,
                ease: MOTION_EASE_OUT,
              }}
            >
              <span className="block text-xs text-[#313131]/58">当前班次</span>
              <strong className="font-technical mt-0.5 block text-lg font-semibold tabular-nums tracking-[0.01em] text-[#313131]">
                <AnimatedNumber value={`${compactNumber(active.duration_hours)}h`} />
              </strong>
              {activeTeamSummary ? (
                <span className="mt-0.5 block whitespace-nowrap text-[10px] text-[#313131]/52">
                  <AnimatedText value={activeTeamSummary} />
                </span>
              ) : null}
            </motion.div>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[#313131]/10 px-4 py-2 text-xs text-[#313131]/68">
          <span>已拥有 <strong className="font-number text-[#313131]">{summary.owned}</strong></span>
          <span>进阶可用 <strong className="font-number text-[#313131]">{summary.tier_up_owned}</strong></span>
          <span>贸易候选 <strong className="font-number text-[#313131]">{summary.trade_pool_ready}</strong></span>
          {manufactureReady !== undefined ? <span>制造候选 <strong className="font-number text-[#313131]">{manufactureReady}</strong></span> : null}
          <span>中枢等级 Lv<span className="font-number">.{layout.rooms.find((room) => room.kind === "control_center")?.level ?? "—"}</span></span>
        </div>
      ) : null}

      {domains.length > 0 || profile?.actions.length || profile?.flags.length || profile?.narration_hints.length ? (
        <details className="group border-t border-[#313131]/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-medium text-[#313131] marker:content-none">
            <span>效率详情 · <span className="font-number">{domains.length}</span> 个指标</span>
            <span className="text-[#313131]/50 group-open:hidden">展开</span>
            <span className="hidden text-[#313131]/50 group-open:inline">收起</span>
          </summary>
          <div className="border-t border-[#313131]/10 bg-white/55 px-4 py-3">
            {domains.length > 0 ? (
              <div className="grid gap-1.5">
                {domains.map((domain) => {
                  const current = profileEfficiency(domain.current);
                  const baseline = profileEfficiency(domain.baseline);
                  return (
                    <div key={domain.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-[#313131]/8 py-1.5 text-xs last:border-0 max-sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <strong className="block truncate font-medium text-[#313131]">{domain.label}</strong>
                        {domain.current.operators.length ? <span className="block truncate text-xs text-[#313131]/52">{domain.current.operators.join(" / ")}</span> : null}
                        {domain.current.mechanic_equivalent_efficiency !== undefined
                          || domain.baseline.mechanic_equivalent_efficiency !== undefined ? (
                            <span className="mt-0.5 block truncate text-[10px] tabular-nums text-[#313131]/48">
                              机制等效 当前 {domain.current.mechanic_equivalent_efficiency === undefined
                                ? "—"
                                : compactNumber(domain.current.mechanic_equivalent_efficiency, 3)}
                              {" · "}参考 {domain.baseline.mechanic_equivalent_efficiency === undefined
                                ? "—"
                                : compactNumber(domain.baseline.mechanic_equivalent_efficiency, 3)}
                            </span>
                          ) : null}
                      </div>
                      <span className="tabular-nums text-[#313131]">当前 {current === undefined ? "—" : compactNumber(current, 2)}</span>
                      <span className="tabular-nums text-[#313131]/55 max-sm:hidden">基准 {baseline === undefined ? "—" : compactNumber(baseline, 2)}</span>
                      <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-semibold", profileSeverityClass(domain.severity))}>
                        {domain.gap_ratio >= 0 ? "+" : ""}{compactNumber(domain.gap_ratio * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {profile?.actions.length ? (
              <ul className="mt-3 grid gap-1 border-t border-[#313131]/10 pt-3 text-xs text-[#313131]/70">
                {profile.actions.map((action, index) => <li key={`${action.domain_id}-${action.operator}-${index}`}><strong className="text-[#313131]">{action.priority}</strong> · {action.message}</li>)}
              </ul>
            ) : null}
            {profile?.flags.length || profile?.narration_hints.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#313131]/10 pt-3">
                {[...(profile?.flags ?? []), ...(profile?.narration_hints ?? [])].map((flag) => <span key={flag} className="bg-[#313131]/7 px-1.5 py-0.5 text-xs text-[#313131]/65">{flag}</span>)}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </motion.section>
  );
}

const ROOM_SLOT_COUNT = 5;
const AUXILIARY_ROOM_GROUPS = new Set(["dormitory", "hire", "meeting", "processing", "training"]);

function scheduleIssueTriggerId(row: RoomRow) {
  return `schedule-issue-${row.key}`;
}

const PLAN_RESULT_PRIMARY_TRIGGER_SELECTOR = "[data-plan-primary-details-trigger]";

function roomSlotCountFor(group: string) {
  if (group === "trading" || group === "manufacture") return 3;
  if (group === "training" || group === "meeting") return 2;
  return ROOM_SLOT_COUNT;
}

export function LevelDiamonds({
  level,
  maxLevel,
  variant = "list",
}: {
  level?: number;
  maxLevel?: number;
  variant?: LevelDiamondVariant;
}) {
  const count = levelDiamondCount(level);
  if (!count || !level) return null;

  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      aria-label={`${level} 级，最高 ${maxLevel ?? level} 级`}
      title={variant === "compact" ? `Lv.${level}/${maxLevel ?? level}` : undefined}
    >
      <span className="level-diamonds" data-variant={variant} aria-hidden="true">
        {Array.from({ length: count }).map((_, index) => (
          <span key={index} className="level-diamond" />
        ))}
      </span>
      {variant === "list" ? (
        <span className="shrink-0 text-xs font-semibold tracking-[0.02em] text-white/68">
          Lv<span className="font-number">.{level}/{maxLevel ?? level}</span>
        </span>
      ) : null}
    </span>
  );
}

export function RoomEfficiencyReadout({
  value,
  details = true,
  trend = 0,
}: {
  value: RoomEfficiencyPresentation;
  details?: boolean;
  trend?: ShiftDirection;
}) {
  return (
    <div className="min-w-0" title={value.details.map((detail) => detail.label ? `${detail.label} ${detail.value}` : detail.value).join(" · ")}>
      <div className="flex min-w-0 items-center gap-1.5">
        <strong
          className="infra-room-value font-technical shrink-0 text-base font-semibold tabular-nums tracking-[0.01em] text-[var(--room-accent)] max-sm:text-xs"
          data-room-primary-efficiency
        >
          <AnimatedNumber value={value.primaryValue} trend={trend} />
        </strong>
        {value.primaryLabel ? (
          <span className="truncate text-xs font-medium text-white/68">
            <AnimatedText value={value.primaryLabel} trend={trend} />
          </span>
        ) : null}
      </div>
      {details && value.details.length ? (
        <div className="font-technical mt-1 flex max-h-9 flex-wrap gap-x-2 gap-y-0.5 overflow-hidden text-xs leading-4 tracking-[0.01em] text-white/60 max-sm:max-h-none">
          {value.details.map((detail, index) => (
            <span key={`${detail.kind ?? ""}-${detail.label ?? ""}-${index}`} className={detail.kind === "cross-station" ? "font-semibold text-[#C8F75A]" : undefined}>
              {value.formula ? <>{detail.operator ? `${detail.operator} ` : ""}<span className="font-number"><AnimatedText value={detail.value} trend={trend} /></span>{detail.label ? ` ${detail.label}` : ""}</> : <>{detail.label} <span className="font-number"><AnimatedText value={detail.value} trend={trend} /></span></>}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RoomEfficiencyDetails({
  value,
  compactFactory = false,
  trend = 0,
}: {
  value: RoomEfficiencyPresentation | null;
  compactFactory?: boolean;
  trend?: ShiftDirection;
}) {
  if (!value?.details.length) return null;

  return (
    <div
      className={cn(
        "font-technical ml-6 grid min-w-[160px] max-w-[240px] gap-1 text-sm leading-tight tracking-[0.01em] text-white/68 max-sm:hidden max-[819px]:ml-0 max-[819px]:min-w-0 max-[819px]:max-w-none max-[819px]:grid-cols-3 max-[819px]:text-xs max-[819px]:leading-normal",
        compactFactory && "min-[1800px]:z-10 min-[1800px]:col-start-1 min-[1800px]:row-start-2 min-[1800px]:ml-0 min-[1800px]:flex min-[1800px]:min-w-0 min-[1800px]:max-w-none min-[1800px]:gap-3 min-[1800px]:text-xs",
        value.formula && "flex max-w-[340px] flex-wrap items-baseline gap-x-1.5 gap-y-1 max-[819px]:grid max-[819px]:grid-cols-3"
      )}
      title={value.details.map((detail) => detail.label ? `${detail.label} ${detail.value}` : detail.value).join(" · ")}
    >
      {value.details.map((detail, index) => (
        <span
          key={`${detail.kind ?? ""}-${detail.label ?? ""}-${index}`}
          className={cn(
            "whitespace-nowrap",
            detail.kind === "cross-station" && "font-semibold text-[#C8F75A]"
          )}
        >
          {value.formula ? <>{detail.operator ? `${detail.operator} ` : ""}<span className="font-number"><AnimatedText value={detail.value} trend={trend} /></span>{detail.label ? ` ${detail.label}` : ""}</> : <>{detail.label} <span className="font-number"><AnimatedText value={detail.value} trend={trend} /></span></>}
        </span>
      ))}
    </div>
  );
}

export function RoomProductControls({
  row,
  layoutRoom,
  onFactoryRecipeChange,
  onTradeOrderChange,
}: {
  row: RoomRow;
  layoutRoom: BaseBlueprint["rooms"][number] | undefined;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
}) {
  if (row.group === "training") {
    return null;
  }

  const isTrade = layoutRoom?.kind === "trade_post";
  const isFactory = layoutRoom?.kind === "factory";
  const activeOrder = isTrade ? tradeOrderFor(layoutRoom) : null;
  const activeRecipe = isFactory ? factoryRecipeFor(layoutRoom) : null;
  const activeProduct = activeOrder ?? activeRecipe;

  if (activeProduct) {
    return (
      <div className={cn("w-full", isTrade ? "max-sm:w-fit" : "max-w-[220px]")}>
        <ProductToggleGroup<TradeOrder | FactoryRecipe>
          ariaLabel={`${row.title} ${isTrade ? "订单" : "配方"}`}
          value={activeProduct}
          options={isTrade ? TRADE_ORDER_OPTIONS : FACTORY_RECIPE_OPTIONS}
          columns={isTrade ? 2 : 4}
          tone={isTrade ? "trade" : "factory"}
          surface="room"
          onChange={(nextProduct) => {
            if (isTrade) onTradeOrderChange(row.roomId, nextProduct as TradeOrder);
            else onFactoryRecipeChange(row.roomId, nextProduct as FactoryRecipe);
          }}
        />
      </div>
    );
  }

  if (!row.product) return null;

  return <div className="infra-room-value text-lg font-medium leading-none text-[var(--room-accent)]">{row.product}</div>;
}

function OperatorSlotShell({
  ariaLabel,
  centerFrameInList,
  compactFactory,
  compactView,
  frameClassName,
  frameContent,
  frameWrapper = (frame) => frame,
  label,
  labelClassName,
  positionLabel,
  title,
}: {
  ariaLabel?: string;
  centerFrameInList: boolean;
  compactFactory: boolean;
  compactView: boolean;
  frameClassName: string;
  frameContent?: ReactNode;
  /** 可选：包装头像框元素（例如包上技能 tooltip 的 trigger）。默认原样返回。 */
  frameWrapper?: (frame: ReactElement) => ReactElement;
  label: ReactNode;
  labelClassName: string;
  positionLabel?: string;
  title?: string;
}) {
  const frame = (
    <div
      className={cn(
        "relative aspect-square h-[var(--operator-slot-size)] min-w-0 shrink-0 overflow-hidden border-2 max-sm:border",
        frameClassName,
        centerFrameInList && "max-sm:h-auto max-sm:w-full sm:absolute sm:left-0 sm:top-1/2 sm:-translate-y-1/2",
      )}
      aria-label={ariaLabel}
    >
      {frameContent}
    </div>
  );

  return (
    <div
      className={cn(
        "infra-operator-slot min-w-0 shrink-0",
        compactView
          ? COMPACT_OPERATOR_SIZE_CLASS
          : "[--operator-slot-size:clamp(70px,7.3vw,80px)] max-sm:[--operator-slot-size:clamp(56px,16vw,76px)]",
        compactFactory && "min-[1800px]:[--operator-slot-size:70px]",
        centerFrameInList && "max-sm:w-full sm:relative sm:h-full sm:w-[var(--operator-slot-size)]",
      )}
      data-position={positionLabel || undefined}
      title={title}
    >
      {frameWrapper(frame)}
      <span
        className={cn(
          "mt-0.5 block truncate text-center leading-tight",
          OPERATOR_NAME_SIZE_CLASS,
          labelClassName,
          centerFrameInList && "sm:absolute sm:left-0 sm:top-[calc(50%+var(--operator-slot-size)/2+2px)] sm:mt-0 sm:w-full",
        )}
      >
        <span className="block truncate">{label}</span>
      </span>
    </div>
  );
}

function BuildingSkillBadge({ skill }: { skill: NonNullable<RoomRow["operatorSlots"][number]["buildingSkill"]> }) {
  const [open, setOpen] = useState(false);
  const unlockLabel = buildingSkillUnlockLabel(skill.elite, skill.level, skill.enhanced);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <button
            type="button"
            className="absolute right-0 top-0 z-10 flex size-10 items-center justify-center border-b border-l border-white/22 bg-black/76 text-white outline-none transition-colors hover:bg-black/88 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFD800] max-sm:size-11"
            aria-label={`基建技能 S${skill.index}：${skill.name}，${unlockLabel}`}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onClick={() => setOpen(true)}
          >
            <img src={skill.icon} alt="" className="size-9 shrink-0 object-contain" aria-hidden="true" />
          </button>
        }
      />
      <TooltipContent
        side="top"
        align="end"
        className="max-w-80 flex-col items-start gap-1.5 whitespace-normal px-3 py-2 text-left leading-relaxed"
      >
        <span className="font-semibold">S<span className="font-number">{skill.index}</span> · {skill.name}</span>
        <span className="text-background/72">
          {skill.enhanced ? (
            <>
              <span>{buildingSkillUnlockPrefix(skill.elite, skill.level)}</span>
              <span className="text-[#22BBFF]">{BUILDING_SKILL_ENHANCED_WORD}</span>
            </>
          ) : (
            unlockLabel
          )}
        </span>
        <span>{skill.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function OperatorSlot({
  slot,
  currentMorale,
  autofill = false,
  compactFactory = false,
  compactView = false,
  centerFrameInList = false,
  shiftDirection = 0,
  transitionDelay = 0,
  portraitSize = 180,
  positionLabel,
  showSkillTooltip = false,
  searchQuery = "",
}: {
  slot: RoomRow["operatorSlots"][number] | undefined;
  currentMorale?: number;
  autofill?: boolean;
  compactFactory?: boolean;
  compactView?: boolean;
  centerFrameInList?: boolean;
  shiftDirection?: ShiftDirection;
  transitionDelay?: number;
  portraitSize?: number;
  positionLabel?: string;
  /** 悬停卡片时展示干员全部基建技能 tooltip，并关闭卡片自身的原生 title hover。 */
  showSkillTooltip?: boolean;
  searchQuery?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const identity = slot?.name ?? (autofill ? "autofill" : "empty");
  const suppressNativeTitles = showSkillTooltip && slot !== undefined;
  const profession = slot ? operatorProfessionPresentationForCode(slot.profession) : undefined;
  const enterX = shouldReduceMotion ? 0 : shiftDirection * 6;
  const exitX = shouldReduceMotion ? 0 : shiftDirection * -4;
  const occupantLabel = slot?.name ?? (autofill ? "自动补位" : "空置");
  const ariaLabel = positionLabel ? `${positionLabel}：${occupantLabel}` : occupantLabel;
  const searchMatched = Boolean(slot && searchQuery && slot.name.toLocaleLowerCase("zh-CN").includes(searchQuery));
  const frameClassName = slot
    ? "border-[#7F7F7F] bg-[#3C3C3C] shadow-[inset_0_0_18px_rgba(255,255,255,0.16)]"
    : autofill
      ? "border-[#666] bg-[#3C3C3C] shadow-[inset_0_0_18px_rgba(255,255,255,0.08)]"
      : "border-[#4B4B4B] bg-[#3C3C3C]";

  const shell = (
    <OperatorSlotShell
      ariaLabel={ariaLabel}
      centerFrameInList={centerFrameInList}
      compactFactory={compactFactory}
      compactView={compactView}
      frameClassName={frameClassName}
      frameContent={
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={identity}
            className="absolute inset-0"
            data-operator-identity={identity}
            initial={{ opacity: 0, x: enterX }}
            animate={{ opacity: 1, x: 0 }}
            exit={{
              opacity: 0,
              x: exitX,
              pointerEvents: "none",
              transition: {
                duration: MOTION_DURATION.fast,
                ease: MOTION_EASE_OUT,
              },
            }}
            transition={{
              duration: shouldReduceMotion ? MOTION_DURATION.feedback : MOTION_DURATION.state,
              delay: shouldReduceMotion ? 0 : transitionDelay,
              ease: MOTION_EASE_OUT,
            }}
          >
            {slot ? (
              <>
                {slot.portrait ? (
                  <>
                    <img
                      src={slot.portrait}
                      alt={slot.name}
                      width={portraitSize}
                      height={portraitSize}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                    />
                    {profession ? (
                      <img
                        src={profession.icon}
                        alt=""
                        aria-hidden="true"
                        title={suppressNativeTitles ? undefined : `职业：${profession.label}`}
                        className="absolute left-0 top-0 z-10 h-[25%] w-auto"
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center bg-[#4B4B4B] px-2 text-center text-xs font-semibold text-white">
                    <AnimatedText value={slot.name} trend={shiftDirection} />
                  </div>
                )}
                {slot.buildingSkill ? (
                  <BuildingSkillBadge skill={slot.buildingSkill} />
                ) : typeof slot.skill === "number" ? (
                  <span
                    className="absolute right-0 top-0 z-10 flex size-9 items-center justify-center border-b border-l border-white/22 bg-black/76 text-xs font-semibold text-white"
                    aria-label={`基建技能 S${slot.skill}，暂无技能资料`}
                  >
                    S<span className="font-number">{slot.skill}</span>
                  </span>
                ) : null}
                {typeof currentMorale === "number" ? (
                  <span
                    className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 whitespace-nowrap rounded-sm bg-black/72 px-1 py-0.5 text-xs font-normal leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.5)] [&_svg]:size-2.5 max-sm:bottom-0.5 max-sm:left-0.5 max-sm:px-0.5 max-sm:[&_svg]:size-2.5"
                    aria-label={`当前心情 ${currentMorale}/24`}
                    title={suppressNativeTitles ? undefined : `当前心情 ${currentMorale}/24`}
                  >
                    <Smile className="text-[#FFD501]" />
                    <span className="max-sm:hidden">当前</span>
                    <span className="font-number"><AnimatedText value={currentMorale} trend={shiftDirection} /></span>
                  </span>
                ) : null}
              </>
            ) : autofill ? (
              <span className="flex h-full items-center justify-center text-xs font-semibold tracking-[0.14em] text-white/55">
                AUTO
              </span>
            ) : (
              <span className="absolute left-1/2 top-1/2 h-0.5 w-[78%] origin-center -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] bg-[#4B4B4B]" aria-hidden="true" />
            )}
          </motion.div>
        </AnimatePresence>
      }
      frameWrapper={showSkillTooltip && slot ? (frame) => (
        <Suspense fallback={frame}>
          <OperatorSkillTooltip name={slot.name} trigger={frame} />
        </Suspense>
      ) : undefined}
      label={slot ? <AnimatedText value={slot.name} trend={shiftDirection} /> : autofill ? "自动补位" : "占"}
      labelClassName={slot
        ? (searchMatched ? "bg-[#FFD501] px-1 text-[#202020]" : "text-white")
        : autofill
          ? "text-white/55"
          : "text-transparent select-none"}
      positionLabel={positionLabel}
      title={suppressNativeTitles ? undefined : slot?.label}
    />
  );

  return shell;
}

export function ScheduleBoard({
  rows,
  layout,
  planRevision,
  currentMoraleByOperator,
  viewControlsSlot,
  mobileActionsSlot,
  shiftInfoSlot,
  activeShift,
  shiftDirection = 0,
  activePlan,
  searchQuery = "",
  animateInitialView = false,
  onIssue,
  onFactoryRecipeChange,
  onTradeOrderChange,
  onViewModeChange,
}: {
  rows: RoomRow[];
  layout: BaseBlueprint;
  planRevision?: string;
  currentMoraleByOperator?: ReadonlyMap<string, number>;
  viewControlsSlot?: ReactNode;
  mobileActionsSlot?: ReactNode;
  shiftInfoSlot?: ReactNode;
  activeShift: number;
  shiftDirection?: ShiftDirection;
  activePlan?: MaaPlan;
  searchQuery?: string;
  animateInitialView?: boolean;
  onIssue: (row: RoomRow) => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
  onViewModeChange?: (viewMode: "list" | "compact") => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [hiddenGroups, setHiddenGroups] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<ScheduleViewMode | null>(null);
  const [supportsCompactLayout, setSupportsCompactLayout] = useState<boolean | null>(null);
  const [CompactScheduleView, setCompactScheduleView] = useState<CompactScheduleComponent | null>(null);
  const [compactScheduleLoadFailed, setCompactScheduleLoadFailed] = useState(false);
  const preferredViewMode = useRef<ScheduleViewMode | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const syncViewMode = (canUseCompactLayout: boolean) => {
      setSupportsCompactLayout(canUseCompactLayout);
      const nextViewMode = canUseCompactLayout
        ? (preferredViewMode.current ?? "compact")
        : "list";
      setViewMode(nextViewMode);
      onViewModeChange?.(nextViewMode);
    };

    syncViewMode(mq.matches);
    const handler = (event: MediaQueryListEvent) => syncViewMode(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [onViewModeChange]);

  useEffect(() => {
    if (viewMode !== "compact" || CompactScheduleView || compactScheduleLoadFailed) return;

    let cancelled = false;
    void loadClientFeature("compactScheduleView").then(
      (module) => {
        if (!cancelled) setCompactScheduleView(() => module.CompactScheduleView);
      },
      () => {
        if (!cancelled) setCompactScheduleLoadFailed(true);
      },
    );
    return () => { cancelled = true; };
  }, [CompactScheduleView, compactScheduleLoadFailed, viewMode]);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center border-y border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">
        没有可展示的布局房间。
      </div>
    );
  }

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("zh-CN");
  const visibleRows = normalizedQuery
    ? rows.filter((row) => row.title.toLocaleLowerCase("zh-CN").includes(normalizedQuery) || row.operators.some((name) => name.toLocaleLowerCase("zh-CN").includes(normalizedQuery)))
    : rows;
  const rowGroups = buildListScheduleGroups(visibleRows);
  const auxiliaryGroups = rowGroups.filter((group) => AUXILIARY_ROOM_GROUPS.has(group.rows[0]?.group ?? ""));
  const hiddenAuxiliaryCount = auxiliaryGroups.filter((group) => hiddenGroups[group.label]).length;
  const allAuxiliaryCollapsed =
    auxiliaryGroups.length > 0 &&
    auxiliaryGroups.every((group) => collapsedGroups[group.label] || hiddenGroups[group.label]);

  function toggleAuxiliaryGroups() {
    if (allAuxiliaryCollapsed) {
      setCollapsedGroups((current) => {
        const next = { ...current };
        auxiliaryGroups.forEach((group) => {
          next[group.label] = false;
        });
        return next;
      });
      setHiddenGroups((current) => {
        const next = { ...current };
        auxiliaryGroups.forEach((group) => {
          next[group.label] = false;
        });
        return next;
      });
      return;
    }

    setCollapsedGroups((current) => {
      const next = { ...current };
      auxiliaryGroups.forEach((group) => {
        next[group.label] = true;
      });
      return next;
    });
  }

  function restoreHiddenAuxiliaryGroups() {
    setHiddenGroups((current) => {
      const next = { ...current };
      auxiliaryGroups.forEach((group) => {
        next[group.label] = false;
      });
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
        <div className="flex flex-wrap items-center gap-2">
          {supportsCompactLayout && viewMode ? (
            <Tabs
              className="hidden lg:block"
              value={viewMode}
              onValueChange={(value) => {
                const nextViewMode = value as ScheduleViewMode;
                preferredViewMode.current = nextViewMode;
                setViewMode(nextViewMode);
                onViewModeChange?.(nextViewMode);
              }}
            >
              <TabsList>
                <TabsTrigger value="compact">一图流布局</TabsTrigger>
                <TabsTrigger value="list">列表式布局</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          {viewControlsSlot}
          {viewMode === "list" && hiddenAuxiliaryCount ? (
            <Button type="button" variant="ghost" size="sm" onClick={restoreHiddenAuxiliaryGroups}>
              恢复已隐藏（<span className="font-number">{hiddenAuxiliaryCount}</span>）
            </Button>
          ) : null}
          {viewMode === "list" && auxiliaryGroups.length ? (
            <div className="flex flex-wrap justify-end gap-2 max-md:w-full max-md:flex-nowrap max-md:items-center max-md:justify-between">
              <Button type="button" variant="outline" size="sm" onClick={toggleAuxiliaryGroups}>
                <motion.span
                  className="flex size-4 items-center justify-center"
                  animate={{ rotate: allAuxiliaryCollapsed ? -90 : 0 }}
                  transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE_IN_OUT }}
                  aria-hidden="true"
                >
                  <ChevronDown className="size-4" />
                </motion.span>
                {allAuxiliaryCollapsed ? "展开辅助设施" : "一键折叠辅助设施"}
              </Button>
              {mobileActionsSlot ? <div className="min-w-0 flex-1 md:hidden">{mobileActionsSlot}</div> : null}
            </div>
          ) : mobileActionsSlot ? <div className="w-full md:hidden">{mobileActionsSlot}</div> : null}
        </div>
        {shiftInfoSlot ? <div className="min-w-0 max-sm:w-full">{shiftInfoSlot}</div> : null}
      </div>
      <motion.div
        data-plan-board
        data-plan-revision={planRevision || undefined}
      >
          <AnimatePresence initial={animateInitialView && !shouldReduceMotion} mode="wait">
            <motion.div
              key={viewMode}
              data-schedule-view={viewMode || undefined}
              initial={{
                opacity: 0,
                y: shouldReduceMotion ? 0 : 8,
              }}
              animate={{ opacity: 1, y: 0, pointerEvents: "auto" }}
              exit={{
                opacity: 0,
                y: shouldReduceMotion ? 0 : -6,
                pointerEvents: "none",
                transition: {
                  duration: shouldReduceMotion ? MOTION_DURATION.feedback : MOTION_DURATION.fast,
                  ease: MOTION_EASE_IN_OUT,
                },
              }}
              transition={{
                duration: shouldReduceMotion ? MOTION_DURATION.feedback : MOTION_DURATION.content,
                ease: MOTION_EASE_OUT,
              }}
            >
        {viewMode === "list" ? (
          <>
          {rowGroups.map((group) => {
        const visual = roomVisualFor(group.rows[0]?.group ?? "default");
        const groupStyle = {
          "--room-accent": visual.accent,
        } as CSSProperties;
        const collapsed = collapsedGroups[group.label];
        const auxiliary = AUXILIARY_ROOM_GROUPS.has(group.rows[0]?.group ?? "");
        const functionalPowerCount = group.rows.filter((row) => row.group === "power").length;
        if (hiddenGroups[group.label]) return null;

        return (
          <section key={group.label} className="min-w-0" aria-label={group.label} style={groupStyle}>
            <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2.5 text-left max-sm:min-h-11"
                aria-expanded={!collapsed}
                onClick={() => setCollapsedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
              >
                <span className="infra-room-accent h-7 w-1.5 shrink-0 bg-[var(--room-accent)]" aria-hidden="true" />
                <h3 className="truncate text-[21px] font-medium leading-none text-[#313131]">{group.label}</h3>
                <span className="font-number text-xs text-[#313131]/56">{group.rows.length}</span>
                <motion.span
                  className="flex size-4 shrink-0 items-center justify-center text-[#313131]/45"
                  animate={{ rotate: collapsed ? -90 : 0 }}
                  transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE_IN_OUT }}
                  aria-hidden="true"
                >
                  <ChevronDown className="size-4" />
                </motion.span>
              </button>
              {auxiliary && collapsed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => setHiddenGroups((current) => ({ ...current, [group.label]: true }))}
                >
                  暂不显示
                </Button>
              ) : null}
            </div>
            <div
              className={cn(
                "grid min-w-0 gap-3 pb-2 max-sm:gap-4 max-sm:pb-4",
                group.label === "功能设施" && listFunctionalFacilityGridClass(),
                group.rows[0]?.group === "manufacture" && "min-[1800px]:grid-cols-2",
                collapsed && "hidden"
              )}
            >
              {group.rows.map((row) => {
                const layoutRoom = layout.rooms.find((room) => room.id === row.roomId);
                const rowVisual = roomVisualFor(row.group);
                const efficiency = presentRoomEfficiency(row.group, row.efficiency);
                const compactInlineRoom = isListFunctionalFacilityRoom(row.group);
                const narrowLeftPanel = listRoomUsesAlignedOperatorOrigin(row.group);
                const compactFactoryRoom = row.group === "manufacture";
                const functionalOperatorPosition = listFunctionalOperatorPosition(row.group);
                const functionalOperatorPlacementClass = listFunctionalOperatorPlacementClass(row.group);
                const slotCount = compactInlineRoom
                  ? (row.group === "meeting" || row.group === "training" ? 2 : 1)
                  : roomSlotCountFor(row.group);
                const slots: Array<{
                  slot: RoomRow["operatorSlots"][number] | undefined;
                  positionLabel?: string;
                }> = row.positionSlots
                  ? row.positionSlots.map(({ slot, positionLabel }) => ({ slot, positionLabel }))
                  : Array.from({ length: slotCount }, (_, index) => ({ slot: row.operatorSlots[index] }));
                const gridTone = roomGridTone(row.group);
                const rowStyle = {
                  "--room-accent": rowVisual.accent,
                  "--room-level": rowVisual.level,
                  "--room-grid-color": gridTone.color,
                  "--room-grid-opacity": gridTone.opacity,
                  "--room-grid-fade-start": gridTone.fadeStart,
                } as CSSProperties;

                return (
                  <div
                    key={row.key}
                    className={cn(
                      "infra-room-surface relative flex w-full overflow-hidden text-white max-[819px]:h-auto max-[819px]:flex-col",
                      listRoomHeightClass(row.group),
                      compactInlineRoom && "[container-type:inline-size]",
                      listFunctionalRoomSpanClass(row.group, functionalPowerCount),
                      row.suspicious && "ring-2 ring-destructive ring-offset-2",
                    )}
                    data-room-group={row.group}
                    data-room-title={row.title}
                    style={rowStyle}
                  >
                    <div className={cn("relative w-[220px] shrink-0 overflow-hidden", compactInlineRoom && "w-[210px]", narrowLeftPanel && "w-[240px]", row.group === "meeting" && "w-[360px]", "max-[819px]:w-full")}>
                      <div
                        className="infra-room-emblem absolute inset-0 bg-left bg-no-repeat"
                        style={{
                          backgroundImage: `url(${rowVisual.background})`,
                          backgroundPosition: "-18px center",
                          backgroundSize: "auto 100%",
                        }}
                        aria-hidden="true"
                      />
                      <div className="relative z-10 flex h-full flex-col justify-center gap-2 px-3 py-3 max-sm:justify-start max-sm:gap-2 max-sm:px-3 max-sm:py-3">
                        <div className="flex flex-col gap-2 max-sm:flex-row max-sm:items-center">
                          <div>
                            <div className="flex items-center gap-2.5 max-sm:gap-1.5">
                              <div className={cn("font-number min-w-0 truncate font-medium tracking-[-0.02em] text-white [text-shadow:0_2px_3px_rgba(0,0,0,0.75)]", listRoomTitleSizeClass())}>
                                {row.title}
                              </div>
                              <LevelDiamonds level={row.level} maxLevel={layoutRoom ? maxRoomLevel(layoutRoom.kind) : row.level} />
                            </div>
                          </div>
                          {efficiency ? (
                            <div className="shrink-0">
                              <RoomEfficiencyReadout value={efficiency} details={false} trend={shiftDirection} />
                            </div>
                          ) : null}
                        </div>
                        <RoomProductControls
                          row={row}
                          layoutRoom={layoutRoom}
                          onFactoryRecipeChange={onFactoryRecipeChange}
                          onTradeOrderChange={onTradeOrderChange}
                        />
                      </div>
                    </div>

                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-5 py-2 pl-2 pr-3 min-[820px]:h-full max-[819px]:flex-col max-[819px]:items-stretch max-[819px]:gap-3 max-[819px]:px-3 max-[819px]:pb-4 max-[819px]:pt-1",
                        compactInlineRoom && "justify-center pl-4 pr-8",
                        compactFactoryRoom && "min-[1800px]:grid min-[1800px]:grid-cols-1 min-[1800px]:grid-rows-[1fr_auto] min-[1800px]:items-stretch min-[1800px]:gap-1 min-[1800px]:pr-3"
                      )}
                    >
                      <div
                        className={cn(
                          "infra-list-operator-grid grid min-w-0 items-center justify-start [column-gap:var(--operator-column-gap-desktop)] min-[820px]:h-full",
                          listMobileOperatorGridClass(),
                          compactInlineRoom ? "min-[820px]:flex-none" : "min-[820px]:flex-1 min-[820px]:grid-flow-col min-[820px]:auto-cols-max",
                          compactFactoryRoom && "min-[1800px]:col-start-1 min-[1800px]:row-span-2 min-[1800px]:row-start-1",
                          compactInlineRoom && (slotCount === 2 ? "grid-cols-2" : "grid-cols-1"),
                          functionalOperatorPlacementClass
                        )}
                        style={{
                          "--operator-column-gap-desktop": functionalOperatorPosition?.columnGap
                            ?? "clamp(0.75rem, 1.25vw, 1.25rem)",
                          ...(functionalOperatorPosition
                            ? { left: functionalOperatorPosition.left }
                            : {}),
                        } as CSSProperties}
                      >
                        {slots.map(({ slot, positionLabel }, index) => (
                          <OperatorSlot
                            key={`${row.key}-${index}`}
                            slot={slot}
                            currentMorale={slot ? currentMoraleByOperator?.get(slot.name) : undefined}
                            autofill={row.group === "dormitory" && row.autofill}
                            compactFactory={compactFactoryRoom}
                            centerFrameInList
                            showSkillTooltip
                            shiftDirection={shiftDirection}
                            transitionDelay={Math.min(index, 2) * 0.02}
                            searchQuery={normalizedQuery}
                            positionLabel={positionLabel}
                          />
                        ))}
                      </div>
                      {compactInlineRoom ? null : (
                        <RoomEfficiencyDetails value={efficiency} compactFactory={compactFactoryRoom} trend={shiftDirection} />
                      )}
                    </div>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            id={scheduleIssueTriggerId(row)}
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="absolute right-2 top-2 z-10 border border-white/10 bg-[#3C3C3C]/55 text-white/70 hover:bg-[#4B4B4B] hover:text-white max-sm:size-11"
                            aria-label={`${row.title} 反馈排班问题`}
                            onClick={() => onIssue(row)}
                          >
                            <FileWarning />
                          </Button>
                        }
                      />
                      <TooltipContent side="left">反馈排班问题</TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
          </>
        ) : viewMode === "compact" ? (
          CompactScheduleView ? (
            <CompactScheduleView
              rows={visibleRows}
              layout={layout}
              currentMoraleByOperator={currentMoraleByOperator}
              activeShift={activeShift}
              activePlan={activePlan}
              shiftDirection={shiftDirection}
              onIssue={onIssue}
            />
          ) : compactScheduleLoadFailed ? (
            <div className="grid min-h-[420px] place-items-center border-y border-destructive/35 text-sm text-destructive" role="alert">
              一图流布局加载失败，请切换到列表式布局。
            </div>
          ) : (
            <CompactScheduleLoading />
          )
        ) : (
          <div className="min-h-[420px]" data-schedule-view-pending aria-hidden="true" />
        )}
            </motion.div>
          </AnimatePresence>
      </motion.div>
    </div>
  );
}

export function ShortcutGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-2xl sm:p-6">
        <DialogHeader className="gap-1.5 px-1 sm:px-2">
          <DialogTitle className="text-xl font-semibold">快捷键</DialogTitle>
          <DialogDescription className="max-w-lg text-sm leading-6">在排班主界面快速定位搜索、关闭临时状态或切换导航。</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border/70 border-y border-border/70 px-1 sm:px-2">
          <div className="flex min-h-14 items-center justify-between gap-8 py-3 max-sm:flex-wrap max-sm:gap-2">
            <span className="text-[15px] font-medium leading-6">聚焦排班搜索</span>
            <KbdGroup className="shrink-0" aria-label="Control 加 K"><Kbd>Ctrl</Kbd><span aria-hidden="true">+</span><Kbd>K</Kbd></KbdGroup>
          </div>
          <div className="flex min-h-14 items-center justify-between gap-8 py-3 max-sm:flex-wrap max-sm:gap-2">
            <span className="text-[15px] font-medium leading-6">清空搜索；计算中取消请求</span>
            <Kbd className="shrink-0">Esc</Kbd>
          </div>
          <div className="flex min-h-14 items-center justify-between gap-8 py-3 max-sm:flex-wrap max-sm:gap-2">
            <span className="text-[15px] font-medium leading-6">展开或收起侧边栏</span>
            <KbdGroup className="shrink-0" aria-label="Control 加 B"><Kbd>Ctrl</Kbd><span aria-hidden="true">+</span><Kbd>B</Kbd></KbdGroup>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function IssueNoteModal({
  open,
  kind,
  row,
  note,
  saving,
  onNoteChange,
  onSave,
  onCancel,
}: {
  open: boolean;
  kind: FeedbackKind;
  row: RoomRow | null;
  note: string;
  saving: boolean;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [consented, setConsented] = useState(false);
  const returnFocusId = useRef<string | null>(null);
  const returnToPlanSummary = useRef(false);
  const isPerformance = kind === "performance_issue";

  useEffect(() => {
    if (open) setConsented(false);
  }, [kind, open, row?.key]);

  useEffect(() => {
    if (row) {
      returnFocusId.current = scheduleIssueTriggerId(row);
      returnToPlanSummary.current = false;
    } else if (open && isPerformance) {
      returnFocusId.current = null;
      returnToPlanSummary.current = true;
    }
  }, [isPerformance, open, row]);

  return (
    <Dialog
      open={open && (isPerformance || Boolean(row))}
      triggerId={row ? scheduleIssueTriggerId(row) : null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent
        className="max-w-[min(620px,calc(100vw-2rem))] sm:max-w-xl"
        finalFocus={() => {
          if (returnFocusId.current) return document.getElementById(returnFocusId.current);
          if (returnToPlanSummary.current) return document.querySelector<HTMLElement>(PLAN_RESULT_PRIMARY_TRIGGER_SELECTOR) ?? true;
          return true;
        }}
      >
        <DialogHeader>
          <DialogTitle>{isPerformance ? "提交性能反馈" : row?.title ?? "反馈排班问题"}</DialogTitle>
          <DialogDescription>{isPerformance ? "反馈本次求解性能" : "反馈排班问题"}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-[13px] leading-5 text-muted-foreground">
            {isPerformance
              ? "将提交本次排班的诊断编号、求解耗时、换班方式、布局和你的说明；不会附带任意房间或完整干员数据。"
              : "将提交本次排班的诊断编号、房间名称、当前干员和你的说明；不会重复上传完整干员数据或调试包。"}
          </p>
          <Textarea
            autoFocus
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={isPerformance ? "例如：同一份 Box 之前通常可以更快完成。" : "例如：这组应该换成可露希尔 / 当前站位有误。"}
            className="min-h-36 text-[13px]"
            maxLength={1000}
          />
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[13px]">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              className="size-4"
            />
            <span>我确认提交以上{isPerformance ? "性能" : "排班问题"}信息。</span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button className="max-sm:min-w-16 sm:min-w-[88px]" size="dialog" variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button size="dialog" onClick={onSave} disabled={!note.trim() || note.trim().length > 1000 || !consented || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "提交中" : "提交反馈"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProductChangeConfirmModal({
  open,
  roomLabel,
  changeKind,
  nextValueLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  roomLabel: string;
  changeKind: "制造配方" | "贸易策略";
  nextValueLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onCancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        aria-busy={busy}
        showCloseButton={!busy}
        className="max-w-[min(520px,calc(100vw-2rem))] sm:max-w-lg"
        data-product-change-confirm
      >
        <DialogHeader>
          <DialogTitle>更改配置并重新排班？</DialogTitle>
          <DialogDescription>
            {roomLabel} 的{changeKind}将切换为「{nextValueLabel}」。当前排班结果会被替换，并立即使用新配置重新排班。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="py-2">
          <p className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            重新排班完成前，配置修改会暂时锁定。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button className="max-sm:min-w-16 sm:min-w-[88px]" type="button" size="dialog" variant="ghost" disabled={busy} autoFocus onClick={onCancel}>
            取消
          </Button>
          <Button type="button" size="dialog" variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            {busy ? "重新排班中" : "确认并重新排班"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
