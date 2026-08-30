"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Database, FileJson, ScanLine, Trash2, Upload } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { RotationSettings } from "@/components/RotationSettings";
import { FiammettaSettings } from "@/components/FiammettaSettings";
import { WizardSteps } from "@/components/interior/wizard-steps";
import { hasSetupConfigurationChanged } from "@/setup-configuration";
import { useWebsiteSession } from "@/website-session";

import type { FactoryRecipe, PowerBudget, TradeOrder } from "./blueprint";
import { FileDrop, LayoutEditor, PresetSelector } from "./components";
import { countOwned } from "./operbox";
import type { SetupStep } from "./onboarding";
import type { BaseBlueprint, BoxSource, DisplayError, OperBoxEntry, PresetDef, RotationProfile, SklandScheduleSnapshot } from "./types";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";

const SETUP_STEP_ORDER: SetupStep[] = ["box", "layout", "facilities"];
const PANEL_TRANSITION = { type: "spring", stiffness: 420, damping: 38, mass: 0.55 } as const;

type SetupDialogProps = {
  open: boolean;
  initialStep: SetupStep;
  onOpenChange: (open: boolean) => void;
  operbox: OperBoxEntry[] | null;
  boxSource: BoxSource;
  fileName: string | null;
  inputMode: "skland" | "maa";
  onInputModeChange: (mode: "skland" | "maa") => void;
  maaPaste: string;
  onMaaPasteChange: (value: string) => void;
  inputError: string | null;
  resultClearWarningDismissed: boolean;
  sklandSnapshot?: SklandScheduleSnapshot | null;
  sklandBindingCount?: number;
  sklandConfigured?: boolean;
  sklandDisabledReason?: string | null;
  onOpenSkland?: () => void;
  onUseSklandSnapshot?: () => void;
  onMaaFile: (file: File) => Promise<boolean>;
  onMaaPaste: () => boolean;
  onRequireWebsiteAccount: () => void;
  presets: PresetDef[];
  preset: PresetDef;
  layout: BaseBlueprint;
  configurationKey: string;
  rotationProfile: RotationProfile;
  onRotationProfileChange: (value: RotationProfile) => void;
  fiammettaEnabled: boolean;
  onFiammettaEnabledChange: (enabled: boolean) => void;
  onPresetSelect: (preset: PresetDef) => void;
  onLayoutFile: (file: File) => Promise<void>;
  onDownloadLayout: () => void;
  onRestoreResultClearWarning: () => void;
  storageNotice: DisplayError | null;
  onClearLocalData: () => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
  onRoomLevelChange: (roomId: string, level: number) => void;
  powerBudget: PowerBudget;
  onFinish: () => void;
  onSkip: () => void;
};

function sourceLabel(source: BoxSource): string {
  if (CLIENT_SKLAND_ENABLED && source === "skland") return "森空岛";
  if (source === "maa") return "MAA 导入";
  return "243 全精二示例";
}

function formatSyncTime(timestamp: number | null | undefined): string {
  const date = timestamp && Number.isFinite(timestamp) ? new Date(timestamp * 1000) : null;
  if (!date || Number.isNaN(date.getTime())) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function SetupDialog({
  open,
  initialStep,
  onOpenChange,
  operbox,
  boxSource,
  fileName,
  inputMode,
  onInputModeChange,
  maaPaste,
  onMaaPasteChange,
  inputError,
  resultClearWarningDismissed,
  sklandSnapshot,
  sklandBindingCount = 0,
  sklandConfigured,
  sklandDisabledReason,
  onOpenSkland,
  onUseSklandSnapshot,
  onMaaFile,
  onMaaPaste,
  onRequireWebsiteAccount,
  presets,
  preset,
  layout,
  configurationKey,
  rotationProfile,
  onRotationProfileChange,
  fiammettaEnabled,
  onFiammettaEnabledChange,
  onPresetSelect,
  onLayoutFile,
  onDownloadLayout,
  onRestoreResultClearWarning,
  storageNotice,
  onClearLocalData,
  onFactoryRecipeChange,
  onTradeOrderChange,
  onRoomLevelChange,
  powerBudget,
  onFinish,
  onSkip,
}: SetupDialogProps) {
  const { data: websiteSession } = useWebsiteSession();
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [stepDirection, setStepDirection] = useState(0);
  const [needsFacilityReview, setNeedsFacilityReview] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [showMaaPaste, setShowMaaPaste] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [openingConfigurationKey, setOpeningConfigurationKey] = useState(configurationKey);
  const wasOpenRef = useRef(false);
  const pendingExternalReviewRef = useRef(false);
  const boxPanelRef = useRef<HTMLDivElement>(null);
  const basicsPanelRef = useRef<HTMLDivElement>(null);
  const facilitiesPanelRef = useRef<HTMLDivElement>(null);
  const hasBox = Boolean(operbox?.length);
  const ownedCount = countOwned(operbox);
  const mustReviewFacilities = needsFacilityReview || !powerBudget.ok;
  const currentDataLabel = CLIENT_SKLAND_ENABLED && boxSource === "skland" && !sklandSnapshot
    ? "上次同步的森空岛数据"
    : fileName || sourceLabel(boxSource);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) return;
    setStep(initialStep);
    setStepDirection(0);
    setNeedsFacilityReview(pendingExternalReviewRef.current);
    pendingExternalReviewRef.current = false;
    setShowImportOptions(!hasBox);
    setShowMaaPaste(false);
    setOpeningConfigurationKey(configurationKey);
  }, [configurationKey, hasBox, initialStep, open]);

  const configurationChanged = open && hasSetupConfigurationChanged(openingConfigurationKey, configurationKey);

  useEffect(() => {
    if (open && !hasBox) setShowImportOptions(true);
  }, [hasBox, open]);

  function focusPanel(ref: { current: HTMLDivElement | null }) {
    window.requestAnimationFrame(() => ref.current?.focus());
  }

  function moveToStep(nextStep: SetupStep) {
    setStepDirection(SETUP_STEP_ORDER.indexOf(nextStep) - SETUP_STEP_ORDER.indexOf(step));
    setStep(nextStep);
  }

  function goToBox() {
    moveToStep("box");
    focusPanel(boxPanelRef);
  }

  function goToBasics() {
    moveToStep("layout");
    focusPanel(basicsPanelRef);
  }

  function reviewFacilities() {
    moveToStep("facilities");
    setNeedsFacilityReview(false);
    focusPanel(facilitiesPanelRef);
  }

  async function importMaaFile(file: File) {
    if (!websiteSession) {
      onRequireWebsiteAccount();
      return;
    }
    if (await onMaaFile(file)) {
      setNeedsFacilityReview(true);
      setShowImportOptions(false);
      goToBasics();
    }
  }

  function importMaaPaste() {
    if (!websiteSession) {
      onRequireWebsiteAccount();
      return;
    }
    if (onMaaPaste()) {
      setNeedsFacilityReview(true);
      setShowImportOptions(false);
      goToBasics();
    }
  }

  function handlePresetSelect(nextPreset: PresetDef) {
    if (nextPreset.label !== preset.label) setNeedsFacilityReview(true);
    onPresetSelect(nextPreset);
  }

  async function handleLayoutFile(file: File) {
    setNeedsFacilityReview(true);
    await onLayoutFile(file);
  }

  function handleOpenSkland() {
    if (!websiteSession) {
      onRequireWebsiteAccount();
      return;
    }
    pendingExternalReviewRef.current = true;
    onOpenSkland?.();
  }

  function handleUseSklandSnapshot() {
    if (!sklandSnapshot) return;
    onUseSklandSnapshot?.();
    setNeedsFacilityReview(true);
    setShowImportOptions(false);
    goToBasics();
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && configurationChanged) {
        setCloseConfirmOpen(true);
        return;
      }
      onOpenChange(nextOpen);
    }}>
      <DialogContent data-setup-dialog className="h-[min(660px,calc(100dvh-1rem))] max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[min(880px,calc(100%-2rem))] sm:rounded-[32px]">
        <Tabs
          value={step === "facilities" ? "layout" : step}
          onValueChange={(value) => {
            if (value === "box") moveToStep("box");
            if (value === "layout" && hasBox) {
              moveToStep("layout");
            }
          }}
          className="contents"
        >
          <div data-setup-top className="px-4 pb-3 pt-4 sm:px-7 sm:pb-4 sm:pt-6">
            <div className="flex min-h-9 items-center gap-3 pr-12">
              <DialogTitle>排班设置</DialogTitle>
              {configurationChanged ? <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">配置已修改</span> : null}
            </div>
            <WizardSteps
              steps={[
                { id: "box", label: "干员数据" },
                { id: "layout", label: "布局" },
                { id: "facilities", label: "设施" },
              ]}
              value={step}
              onValueChange={(value) => {
                if (value === "box") goToBox();
                if (value === "layout" && hasBox) goToBasics();
                if (value === "facilities" && hasBox) reviewFacilities();
              }}
              className="mt-3"
            />
          </div>

          <TabsContent value="box" className="min-h-0 overflow-hidden overscroll-contain">
            <ScrollArea className="h-full" viewportClassName="overflow-x-hidden">
              <motion.div
                key={`box-${step}`}
                ref={boxPanelRef}
                data-setup-box-content
                role="region"
                aria-label="干员数据"
                tabIndex={-1}
                className="grid w-full gap-4 px-4 py-4 outline-none sm:px-7 sm:py-6"
                initial={reducedMotion ? false : { x: stepDirection * 28, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={reducedMotion ? { duration: 0 } : PANEL_TRANSITION}
              >
                {hasBox ? (
                  <section className="setup-data-summary flex min-w-0 items-center justify-between gap-4 px-4 py-3.5" aria-labelledby="setup-current-data-title">
                    <div className="flex min-w-0 items-center gap-3">
                      <Database className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <div className="min-w-0">
                        <h3 id="setup-current-data-title" className="truncate text-sm font-semibold">{currentDataLabel}</h3>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          <span className="font-number">{operbox?.length ?? 0}</span> 名干员 · <span className="font-number">{ownedCount}</span> 名可用
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 shrink-0"
                      aria-expanded={showImportOptions}
                      aria-controls="setup-import-options"
                      onClick={() => setShowImportOptions((current) => !current)}
                    >
                      {showImportOptions ? "收起" : "更换"}
                    </Button>
                  </section>
                ) : null}

                {showImportOptions ? (
                  <section id="setup-import-options" className="setup-config-panel p-4 sm:p-5" aria-labelledby="setup-import-title">
                    <h3 id="setup-import-title" className="sr-only">选择干员数据来源</h3>
                    <Tabs value={CLIENT_SKLAND_ENABLED ? inputMode : "maa"} onValueChange={(value) => onInputModeChange(value as "skland" | "maa")}>
                      {CLIENT_SKLAND_ENABLED ? (
                        <TabsList className="h-auto w-full rounded-[4px] sm:w-auto" aria-label="干员数据来源">
                          <TabsTrigger value="skland" className="rounded-[4px]"><Database />森空岛</TabsTrigger>
                          <TabsTrigger value="maa" className="rounded-[4px]"><FileJson />MAA</TabsTrigger>
                        </TabsList>
                      ) : null}
                      {CLIENT_SKLAND_ENABLED ? <TabsContent value="skland" className="pt-4">
                        <div className="setup-import-action flex flex-wrap items-center justify-between gap-4 px-4 py-4">
                          <div className="min-w-0">
                            <strong className="block truncate text-sm">
                              {sklandSnapshot
                                ? sklandSnapshot.roles.find((role) => role.isDefault)?.nickname
                                  ?? sklandSnapshot.roles[0]?.nickname
                                  ?? "森空岛同步"
                                : "森空岛同步"}
                            </strong>
                            {sklandSnapshot ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                <span className="font-number">{sklandSnapshot.operbox.length}</span> 名干员 · <span className="font-number">{formatSyncTime(sklandSnapshot.infrastructure.storeTs)}</span>
                              </span>
                            ) : !sklandConfigured && sklandDisabledReason ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">{sklandDisabledReason}</span>
                            ) : sklandBindingCount > 0 ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">网站账号已绑定，当前浏览器需要重新扫码授权</span>
                            ) : null}
                          </div>
                          {sklandSnapshot && boxSource !== "skland" ? (
                            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                              <Button type="button" variant="ghost" className="h-11" onClick={handleOpenSkland}>
                                重新同步
                              </Button>
                              <Button type="button" className="h-11" onClick={handleUseSklandSnapshot}>
                                使用森空岛数据
                              </Button>
                            </div>
                          ) : (
                            <Button type="button" className="h-11 w-full sm:w-auto" onClick={handleOpenSkland}>
                              <ScanLine />前往森空岛同步
                            </Button>
                          )}
                        </div>
                        {sklandSnapshot?.warnings.length ? (
                          <ul className="mt-3 grid gap-1 text-xs text-amber-700" role="status">
                            {sklandSnapshot.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
                          </ul>
                        ) : null}
                      </TabsContent> : null}
                      <TabsContent value="maa" className="grid gap-3 pt-4">
                        {!websiteSession ? (
                          <Alert>
                            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <span>MAA 导入需要先登录已验证的网站账号；全角色示例和技能查询仍可匿名使用。</span>
                              <Button type="button" size="sm" className="min-h-11 shrink-0" onClick={onRequireWebsiteAccount}>
                                登录后导入
                              </Button>
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <>
                            <FileDrop fileName={boxSource === "maa" ? fileName : null} onFile={(file) => void importMaaFile(file)} />
                            <Button
                              type="button"
                              variant="ghost"
                              className="min-h-11 w-fit"
                              aria-expanded={showMaaPaste}
                              aria-controls="setup-maa-paste"
                              onClick={() => setShowMaaPaste((current) => !current)}
                            >
                              {showMaaPaste ? "收起 JSON" : "粘贴 JSON"}
                            </Button>
                          </>
                        )}
                        {websiteSession && showMaaPaste ? (
                          <div id="setup-maa-paste" className="grid gap-2">
                            <Label htmlFor="setup-maa-json">JSON 内容</Label>
                            <Textarea
                              id="setup-maa-json"
                              value={maaPaste}
                              onChange={(event) => onMaaPasteChange(event.target.value)}
                              placeholder="粘贴 Arknights_OperBox_Export.json 内容"
                              className="min-h-28 resize-y rounded-[4px] font-mono text-base sm:text-sm"
                              aria-invalid={Boolean(inputError)}
                              aria-describedby={inputError ? "setup-box-error" : undefined}
                            />
                            <Button type="button" variant="outline" className="h-10 w-full" disabled={!maaPaste.trim()} onClick={importMaaPaste}>
                              导入 JSON
                            </Button>
                          </div>
                        ) : null}
                      </TabsContent>
                    </Tabs>
                    {inputError ? <p id="setup-box-error" className="mt-3 text-sm text-destructive" role="alert">{inputError}</p> : null}
                  </section>
                ) : null}

                {storageNotice ? (
                  <Alert className="rounded-lg border-amber-200 bg-amber-50 text-amber-700" role="status">
                    <AlertDescription className="text-amber-700">
                      {storageNotice.message}（{storageNotice.code}）
                    </AlertDescription>
                  </Alert>
                ) : null}

                <details className="setup-quiet-details">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">数据管理</summary>
                  <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="text-xs text-muted-foreground">数据在此浏览器保存 <span className="font-number">30</span> 天。</span>
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => setClearConfirmOpen(true)}>
                      <Trash2 />清除本地数据
                    </Button>
                  </div>
                </details>
              </motion.div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="layout" className="min-h-0 overflow-hidden overscroll-contain">
            <Tabs
              value={step === "facilities" ? "facilities" : "basics"}
              className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-0"
            >
              <TabsContent value="basics" className="min-h-0 overflow-hidden">
                <ScrollArea className="h-full" viewportClassName="overflow-x-hidden">
                  <motion.div
                    key={`layout-${step}`}
                    ref={basicsPanelRef}
                    data-setup-layout-basics
                    role="region"
                    aria-label="布局与换班"
                    tabIndex={-1}
                    className="grid gap-6 px-4 py-5 outline-none sm:px-7 sm:py-6"
                    initial={reducedMotion ? false : { x: stepDirection * 28, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={reducedMotion ? { duration: 0 } : PANEL_TRANSITION}
                  >
                    <section className="grid gap-3" aria-labelledby="setup-preset-title">
                      <h3 id="setup-preset-title" className="text-sm font-semibold">布局预设</h3>
                      <PresetSelector presets={presets} selected={preset} onSelect={handlePresetSelect} />
                    </section>

                    <div className="pt-1">
                      <RotationSettings value={rotationProfile} onChange={onRotationProfileChange} />
                    </div>

                    <div className="border-t border-border/70 pt-5">
                      <FiammettaSettings
                        enabled={fiammettaEnabled}
                        operbox={operbox}
                        rotation={rotationProfile}
                        onEnabledChange={onFiammettaEnabledChange}
                      />
                    </div>

                    <details className="setup-quiet-details pt-1">
                      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">高级工具</summary>
                      <div className="grid gap-2 py-3 sm:grid-cols-2">
                        <Label pressable className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-dashed text-sm font-medium text-muted-foreground transition-[color,border-color,background-color] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:border-primary hover:bg-muted/40 hover:text-primary">
                          <Upload className="size-4" />导入布局
                          <input
                            className="sr-only"
                            type="file"
                            accept="application/json,.json"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void handleLayoutFile(file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </Label>
                        <Button type="button" variant="outline" className="min-h-11 w-full" onClick={onDownloadLayout}>
                          <FileJson />导出布局
                        </Button>
                        {resultClearWarningDismissed ? (
                          <Button type="button" variant="ghost" className="min-h-11 w-fit" onClick={onRestoreResultClearWarning}>
                            恢复切换提示
                          </Button>
                        ) : null}
                      </div>
                    </details>
                    {inputError ? <p id="setup-layout-error" className="text-sm text-destructive" role="alert">{inputError}</p> : null}
                  </motion.div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="facilities" className="min-h-0 overflow-hidden">
                <ScrollArea className="h-full" viewportClassName="overflow-x-hidden">
                  <motion.div
                    key={`facilities-${step}`}
                    ref={facilitiesPanelRef}
                    data-setup-facilities
                    role="region"
                    aria-label="设施设置"
                    tabIndex={-1}
                    className="px-4 py-5 outline-none sm:px-7 sm:py-6"
                    initial={reducedMotion ? false : { x: stepDirection * 28, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={reducedMotion ? { duration: 0 } : PANEL_TRANSITION}
                  >
                    <LayoutEditor
                      layout={layout}
                      onFactoryRecipeChange={onFactoryRecipeChange}
                      onTradeOrderChange={onTradeOrderChange}
                      onRoomLevelChange={onRoomLevelChange}
                    />
                    {inputError ? <p className="mt-3 text-sm text-destructive" role="alert">{inputError}</p> : null}
                  </motion.div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        <footer data-setup-footer className="setup-dialog-footer flex w-full min-w-0 flex-nowrap items-center justify-end gap-1.5 px-4 pb-4 pt-2 sm:gap-2 sm:px-7 sm:pb-7 sm:pt-3">
          {step === "box" ? (
            <>
              <Button className="max-sm:min-w-16 sm:min-w-[88px]" size="dialog" type="button" variant="ghost" onClick={onSkip}>稍后</Button>
              <Button size="dialog" type="button" disabled={!hasBox} onClick={goToBasics}>继续</Button>
            </>
          ) : step === "layout" ? (
            <>
              <Button className="max-sm:min-w-16 sm:min-w-[88px]" size="dialog" type="button" variant="ghost" onClick={goToBox}>返回</Button>
              <Button size="dialog" type="button" onClick={reviewFacilities}>
                {mustReviewFacilities ? "检查设施" : "继续"}
              </Button>
            </>
          ) : (
            <>
              <span
                className={`mr-auto min-w-0 truncate text-left text-xs tabular-nums sm:text-sm ${powerBudget.ok ? "text-emerald-700" : "text-red-600"}`}
                role="status"
              >
                <span className={`sm:hidden ${powerBudget.ok ? "text-emerald-700" : "text-red-600"}`}>
                  {powerBudget.ok ? "电力正常" : `缺 ${powerBudget.consumed - powerBudget.generated}`}
                </span>
                <span className={`max-sm:hidden ${powerBudget.ok ? "text-emerald-700" : "text-red-600"}`}>
                  {powerBudget.ok
                    ? `电力正常 · ${powerBudget.consumed}/${powerBudget.generated}`
                    : `电力不足 ${powerBudget.consumed - powerBudget.generated} · ${powerBudget.consumed}/${powerBudget.generated}`}
                </span>
              </span>
              <Button className="max-sm:min-w-16 sm:min-w-[88px]" size="dialog" type="button" variant="ghost" onClick={goToBasics}>返回</Button>
              <Button className="shrink-0" size="dialog" type="button" disabled={!powerBudget.ok} onClick={onFinish}><Check />完成</Button>
            </>
          )}
        </footer>
      </DialogContent>

      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent layer="nested" className="max-w-[min(460px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>清除本地数据？</DialogTitle>
            <DialogDescription>
              {CLIENT_SKLAND_ENABLED
                ? "将删除此浏览器中的布局、干员数据、最近排班和提示偏好。森空岛登录状态不会退出。"
                : "将删除此浏览器中的布局、干员数据、最近排班和提示偏好。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="max-sm:min-w-16 sm:min-w-[88px]" type="button" size="dialog" variant="ghost" onClick={() => setClearConfirmOpen(false)}>保留数据</Button>
            <Button
              type="button"
              size="dialog"
              variant="destructive"
              onClick={() => {
                onClearLocalData();
                setClearConfirmOpen(false);
              }}
            >
              清除本地数据
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>关闭排班设置？</DialogTitle>
            <DialogDescription>配置修改已保存在本地。关闭后需要重新生成排班，结果才会按新配置更新。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCloseConfirmOpen(false)}>继续编辑</Button>
            <Button type="button" onClick={() => { setCloseConfirmOpen(false); onOpenChange(false); }}>关闭设置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
