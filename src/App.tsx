"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAccountCloudWorkspace } from "account-cloud-workspace-bridge";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar, SklandAccountControl } from "@/components/layout/AppTopBar";
import { AppMotionProvider } from "@/components/MotionProvider";
import { PrimaryPageTransition } from "@/components/layout/PrimaryPageTransition";
import { SetupDialogSkeleton } from "@/components/setup/SetupDialogSkeleton";
import { LiveActivity, usePlanActivity } from "@/components/ui/live-activity";
import { TooltipProvider } from "@/components/ui/tooltip";
import { trackTelemetry } from "@/lib/telemetry-dispatch";
import { loadClientFeature } from "@/client-lazy-loader";
import { WorkbenchContext } from "@/workbench-context";
import { WORKBENCH_PAGE_PATHS, workbenchHref, workbenchPageFromPathname, type AppPage } from "@/workbench-routes";
import { useWebsiteSession } from "@/website-session";
import { usePlanTask } from "@/hooks/use-plan-task";
import { LanguageDemoProvider, LanguageDemoSwitch, useLanguageDemo } from "@/language-demo";

import {
  computePlan,
  deleteAllSklandAccountData,
  deleteSklandAccount,
  getHealth,
  getSampleOperbox,
  getSklandAccounts,
  refreshSklandStatus,
  submitPlanTask,
  saveFeedback,
  selectSklandRole,
  toDisplayError,
} from "./api";
import {
  buildBlueprint,
  computePowerBudget,
  FACTORY_RECIPE_OPTIONS,
  FactoryRecipe,
  PRESETS,
  TRADE_ORDER_OPTIONS,
  TradeOrder,
  updateFactoryRecipe,
  updateRoomLevel,
  updateTradeOrder,
} from "./blueprint";
import {
  ONBOARDING_COMPLETED_VALUE,
  ONBOARDING_DISMISSED_VALUE,
  ONBOARDING_STORAGE_KEY,
  resolveOnboardingPreference,
  type OnboardingPreference,
} from "./onboarding";
import { normalizeOperboxEntries } from "./operbox-normalization";
import { effectiveFiammettaSetting, resolvePlanPresentationLayout } from "./plan-presentation";
import {
  applyLocalLayoutPatch,
  clearLocalProductData,
  loadPersistedSession,
  persistSession,
  RESULT_CLEAR_WARNING_DISMISSED_KEY,
} from "./persistence";
import type { RoomRow } from "./schedule";
import { DEFAULT_ROTATION_PROFILE } from "./rotation-settings";
import { MOTION_DURATION } from "./motion";
import { emptySklandBindingSummary } from "./skland-binding-state";
import { createSklandRestoreGuard } from "./skland-restore-guard";
import { setupConfigurationFingerprint } from "./setup-configuration";
import {
  BaseBlueprint,
  BoxSource,
  BlueprintRoom,
  DisplayError,
  FeedbackData,
  FeedbackKind,
  OperBoxEntry,
  PublicPlanData,
  PresetDef,
  RotationProfile,
  SavedPlanData,
  ShiftComparison,
  SklandAccountSummary,
  SklandBindingSummary,
  SklandSessionData,
  SklandScheduleSnapshot,
  SklandStatusSnapshot,
} from "./types";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";
const CLIENT_ACCOUNT_CLOUD_SYNC_ENABLED = process.env.APP_CLIENT_ACCOUNT_CLOUD_SYNC_ENABLED === "1";
const WEBSITE_AUTH_FOCUS_RETURN_DELAY_MS = Math.ceil(MOTION_DURATION.fast * 1_000) + 50;

function bindingSummaryFromSession(session: Pick<SklandSessionData, "accounts" | "bindingCount" | "bindingSummary">): SklandBindingSummary {
  if (session.bindingSummary) return session.bindingSummary;
  const totalCount = Number.isFinite(session.bindingCount) ? session.bindingCount : session.accounts.length;
  const activeCount = session.accounts.length > 0 ? Math.min(totalCount, session.accounts.length) : totalCount;
  const expiries = session.accounts.map((account) => account.credentialExpiresAt).filter(Number.isFinite);
  return {
    totalCount,
    activeCount,
    renewalDueCount: Math.max(0, totalCount - activeCount),
    nextExpiresAt: expiries.length ? Math.min(...expiries) : null,
    latestExpiredAt: null,
  };
}

const loadWebsiteAccountDialog = () => loadClientFeature("websiteAccountDialog");
const loadSetupDialog = () => loadClientFeature("setupDialog");
const loadComponents = () => loadClientFeature("sharedComponents");

const WebsiteAccountDialog = lazy(() => loadWebsiteAccountDialog().then((module) => ({
  default: module.WebsiteAccountDialog,
})));
const SetupDialog = lazy(() => loadSetupDialog().then((module) => ({ default: module.SetupDialog })));
const IssueNoteModal = lazy(() => loadComponents().then((module) => ({ default: module.IssueNoteModal })));
const ProductChangeConfirmModal = lazy(() => loadComponents().then((module) => ({
  default: module.ProductChangeConfirmModal,
})));
type ProductChange =
  | { type: "factory"; roomId: string; recipe: FactoryRecipe }
  | { type: "trade"; roomId: string; order: TradeOrder };
type WebsiteAuthIntent = "account" | "run" | "setup" | "skland";

type SklandFullRestoreResult =
  | { session: SklandSessionData; error?: never }
  | { session?: never; error: unknown };

function layoutWithProductChange(layout: BaseBlueprint, change: ProductChange): BaseBlueprint {
  return change.type === "factory"
    ? updateFactoryRecipe(layout, change.roomId, change.recipe)
    : updateTradeOrder(layout, change.roomId, change.order);
}

function displayError(code: DisplayError["code"], message: string, retryable = false): DisplayError {
  return { code, message, retryable };
}

function resolvePreset(value: PresetDef | undefined): PresetDef {
  return PRESETS.find((preset) => preset.label === value?.label) ?? PRESETS[0];
}

function parseLayoutJson(value: unknown): BaseBlueprint | null {
  if (!value || typeof value !== "object") return null;
  const layout = value as Partial<BaseBlueprint>;
  if (typeof layout.template !== "string" || !Array.isArray(layout.rooms) || !layout.scenario || typeof layout.scenario !== "object") {
    return null;
  }
  const rooms = layout.rooms.map((room) => {
    if (!room || typeof room !== "object" || typeof room.id !== "string" || typeof room.kind !== "string") return null;
    const level = Number((room as BlueprintRoom).level);
    const maxLevel = (room as BlueprintRoom).kind === "control_center" || (room as BlueprintRoom).kind === "dormitory" ? 5 : 3;
    if (!Number.isInteger(level) || level < 1 || level > maxLevel) return null;
    return { ...room, level } as BlueprintRoom;
  });
  if (rooms.some((room) => room === null) || !rooms.some((room) => room?.kind === "control_center")) return null;
  return { ...layout, drone_cap: Number(layout.drone_cap ?? 0), scenario: layout.scenario, rooms: rooms as BlueprintRoom[] } as BaseBlueprint;
}

function layoutValidationError(layout: BaseBlueprint): string | null {
  if (!layout.rooms.some((room) => room.kind === "control_center")) return "布局必须包含控制中枢。";
  const invalid = layout.rooms.find((room) => {
    const maxLevel = room.kind === "control_center" || room.kind === "dormitory" ? 5 : 3;
    return !Number.isInteger(room.level) || room.level < 1 || room.level > maxLevel;
  });
  if (!invalid) return null;
  const maxLevel = invalid.kind === "control_center" || invalid.kind === "dormitory" ? 5 : 3;
  return `${invalid.id} 的设施等级必须在 1–${maxLevel} 之间。`;
}

function restoreEditableProducts(baseLayout: BaseBlueprint, cachedLayout: BaseBlueprint | undefined): BaseBlueprint {
  if (!cachedLayout) return baseLayout;

  const cachedRooms = new Map(cachedLayout.rooms.map((room) => [room.id, room]));
  return {
    ...baseLayout,
    rooms: baseLayout.rooms.map((room) => {
      const cachedRoom = cachedRooms.get(room.id);
      if (room.kind === "factory" && cachedRoom?.kind === "factory" && cachedRoom.product && "factory" in cachedRoom.product) {
        return {
          ...room,
          level: Number.isFinite(cachedRoom.level) ? cachedRoom.level : room.level,
          product: { factory: { recipe: cachedRoom.product.factory.recipe } },
        };
      }
      if (
        room.kind === "trade_post" &&
        cachedRoom?.kind === "trade_post" &&
        cachedRoom.product &&
        "trade" in cachedRoom.product
      ) {
        return {
          ...room,
          level: Number.isFinite(cachedRoom.level) ? cachedRoom.level : room.level,
          product: { trade: { order: cachedRoom.product.trade.order } },
        };
      }
      return { ...room, level: typeof cachedRoom?.level === "number" ? cachedRoom.level : room.level };
    }),
  };
}

function mergeSklandLayout(current: BaseBlueprint, suggestion: BaseBlueprint): BaseBlueprint {
  return {
    ...suggestion,
    drone_cap: current.drone_cap,
    scenario: structuredClone(current.scenario),
  };
}

function WorkbenchAppContent({ children }: { children: ReactNode }) {
  const { locale } = useLanguageDemo();
  const pathname = usePathname();
  const router = useRouter();
  const page = workbenchPageFromPathname(pathname);
  const { data: websiteSession, isPending: websiteSessionPending, refetch: refetchWebsiteSession } = useWebsiteSession();
  const defaultPreset = PRESETS[0];
  const defaultLayout = buildBlueprint(defaultPreset);
  const hasRenderedCalculator = useRef(false);
  const revealedPlanRevisions = useRef(new Set<string>());
  const planClickAtRef = useRef<number | null>(null);
  const websiteAuthReturnFocusRef = useRef<HTMLElement | null>(null);
  const websiteAuthIntentRef = useRef<WebsiteAuthIntent | null>(null);
  const websiteIntentContinuationRef = useRef<(intent: WebsiteAuthIntent) => void>(() => undefined);
  const websiteAuthFocusReturnTimerRef = useRef<number | null>(null);
  const [websiteAuthReloadKey, setWebsiteAuthReloadKey] = useState(0);
  const [websiteAuthDialogOpen, setWebsiteAuthDialogOpen] = useState(false);
  const [websiteAuthDialogMounted, setWebsiteAuthDialogMounted] = useState(false);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  const [onboardingPreference, setOnboardingPreference] = useState<OnboardingPreference>("active");
  const [preset, setPreset] = useState<PresetDef>(defaultPreset);
  const [layout, setLayout] = useState<BaseBlueprint>(defaultLayout);
  const powerBudget = useMemo(() => computePowerBudget(layout), [layout]);
  const [operbox, setOperboxState] = useState<OperBoxEntry[] | null>(null);
  const currentOperboxRef = useRef<OperBoxEntry[] | null>(operbox);
  const setOperbox = useCallback<Dispatch<SetStateAction<OperBoxEntry[] | null>>>((nextOperbox) => {
    const resolvedOperbox = typeof nextOperbox === "function"
      ? nextOperbox(currentOperboxRef.current)
      : nextOperbox;
    currentOperboxRef.current = resolvedOperbox;
    setOperboxState(resolvedOperbox);
  }, []);
  const [fileName, setFileName] = useState<string | null>(null);
  const [boxSource, setBoxSourceState] = useState<BoxSource>("sample");
  const currentBoxSourceRef = useRef<BoxSource>(boxSource);
  const setBoxSource = useCallback<Dispatch<SetStateAction<BoxSource>>>((nextSource) => {
    const resolvedSource = typeof nextSource === "function"
      ? nextSource(currentBoxSourceRef.current)
      : nextSource;
    currentBoxSourceRef.current = resolvedSource;
    setBoxSourceState(resolvedSource);
  }, []);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [layoutSource, setLayoutSource] = useState<"local" | "skland">("local");
  const [localLayoutBackup, setLocalLayoutBackup] = useState<BaseBlueprint | null>(null);
  const [rotationProfile, setRotationProfile] = useState<RotationProfile>(DEFAULT_ROTATION_PROFILE);
  const [fiammettaEnabled, setFiammettaEnabled] = useState(false);
  const [inputMode, setInputMode] = useState<"skland" | "maa" | "manual">(CLIENT_SKLAND_ENABLED ? "skland" : "maa");
  const [maaPaste, setMaaPaste] = useState("");
  const [sklandScheduleSnapshot, setSklandScheduleSnapshot] = useState<SklandScheduleSnapshot | null>(null);
  const [sklandStatusSnapshot, setSklandStatusSnapshot] = useState<SklandStatusSnapshot | null>(null);
  const [sklandStatusReloadKey, setSklandStatusReloadKey] = useState(0);
  const [sklandAccounts, setSklandAccounts] = useState<SklandAccountSummary[]>([]);
  const [sklandActiveAccountId, setSklandActiveAccountId] = useState<string | null>(null);
  const [sklandBindingSummary, setSklandBindingSummary] = useState<SklandBindingSummary>(emptySklandBindingSummary);
  const [sklandConfigured, setSklandConfigured] = useState(false);
  const [sklandDisabledReason, setSklandDisabledReason] = useState<string | null>(null);
  const [sklandSessionLoading, setSklandSessionLoading] = useState(false);
  const [sklandError, setSklandError] = useState<DisplayError | null>(null);
  const [sklandBusy, setSklandBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMounted, setSetupMounted] = useState(false);
  const [issueModalMounted, setIssueModalMounted] = useState(false);
  const [productModalMounted, setProductModalMounted] = useState(false);
  const initialLayoutForRestore = useRef(defaultLayout);
  const initialBoxSource = useRef(boxSource);
  const initialOperbox = useRef(operbox);
  const initialLayoutDirty = useRef(layoutDirty);
  const initialLayoutSource = useRef<"local" | "skland">("local");
  const initialLocalLayoutBackup = useRef<BaseBlueprint | null>(null);
  const skipNextPersistence = useRef(false);
  const hadPersistedSession = useRef(false);
  const statusLoadingAccount = useRef<string | null>(null);
  const sklandRestoreGuard = useRef(createSklandRestoreGuard());
  const sklandFullRestore = useRef<{
    generation: number;
    reloadKey: number;
    result: Promise<SklandFullRestoreResult>;
  } | null>(null);
  const sklandFullRestorePending = useRef(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [inputErrorCode, setInputErrorCode] = useState<DisplayError["code"]>("AIC-BOX-1101");
  const [sampleLoading, setSampleLoading] = useState(false);
  const sampleTrialInFlightRef = useRef(false);
  const [result, setResult] = useState<PublicPlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cliReady, setCliReady] = useState(false);
  const [taskQueueEnabled, setTaskQueueEnabled] = useState(false);
  const [apiError, setApiError] = useState<DisplayError | null>(null);
  const [planRetryCountdown, setPlanRetryCountdown] = useState(0);
  const planRetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [storageNotice, setStorageNotice] = useState<DisplayError | null>(null);
  const [activeShift, setActiveShift] = useState(0);
  const [issueDraftKind, setIssueDraftKind] = useState<FeedbackKind>("room_issue");
  const [issueDraftRow, setIssueDraftRow] = useState<RoomRow | null>(null);
  const [issueDraftNote, setIssueDraftNote] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackData | null>(null);
  const [resultClearNotice, setResultClearNotice] = useState<string | null>(null);
  const [resultClearWarningDismissed, setResultClearWarningDismissed] = useState(false);
  const [pendingProductChange, setPendingProductChange] = useState<ProductChange | null>(null);

  function clearPlanRetryCooldown() {
    if (planRetryTimerRef.current) {
      clearInterval(planRetryTimerRef.current);
      planRetryTimerRef.current = null;
    }
    setPlanRetryCountdown(0);
  }

  function startPlanRetryCooldown(seconds: number) {
    clearPlanRetryCooldown();
    setPlanRetryCountdown(Math.max(1, Math.ceil(seconds)));
    planRetryTimerRef.current = setInterval(() => {
      setPlanRetryCountdown((current) => {
        if (current <= 1) {
          if (planRetryTimerRef.current) clearInterval(planRetryTimerRef.current);
          planRetryTimerRef.current = null;
          return 0;
        }
        return current - 1;
      });
    }, 1_000);
  }

  useEffect(() => () => {
    if (planRetryTimerRef.current) clearInterval(planRetryTimerRef.current);
  }, []);

  const planTask = usePlanTask({
    onDone: (finalizedResult) => {
      setCliReady(true);
      setActiveShift(0);
      setResult(finalizedResult);
      setLoading(false);
      completeOnboarding();
      setLayout((current) => resolvePlanPresentationLayout(current, finalizedResult));
      trackTelemetry({ type: "interaction", name: "plan_response", page: "calculator" });
      trackTelemetry({
        type: "performance",
        name: "plan_result",
        page: "calculator",
        durationMs: typeof finalizedResult.durationMs === "number" ? finalizedResult.durationMs : undefined,
      });
    },
    onFailed: (message) => {
      setLoading(false);
      setApiError(displayError("AIC-PLAN-3004", message));
    },
  });

  useEffect(() => {
    if (planTask.status === "cancelled") setLoading(false);
  }, [planTask.status]);
  // loading 完全由任务状态推导：提交、刷新恢复、取消都会同步驱动界面。
  useEffect(() => {
    setLoading(Boolean(planTask.taskId));
  }, [planTask.taskId]);

  // 公开排班结果只包含产品页面需要的效率、MAA 与轮换数据。
  const scheduleResult = result;
  const activePlan = scheduleResult?.maa.plans?.[activeShift];
  const activeRotationShift = scheduleResult?.rotation.shifts?.[activeShift];
  const activeTrainingRoomShift = result?.trainingRoom?.shifts[activeShift];
  const [baseRows, setBaseRows] = useState<RoomRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    void import("./schedule").then(({ planToRows }) => {
      if (!cancelled) setBaseRows(planToRows(activePlan, activeRotationShift, layout, activeTrainingRoomShift));
    });
    return () => { cancelled = true; };
  }, [activePlan, activeRotationShift, activeTrainingRoomShift, layout]);
  const [presentedRows, setPresentedRows] = useState<{ source: RoomRow[]; rows: RoomRow[] } | null>(null);
  useEffect(() => {
    if (!baseRows.some((row) => row.operatorSlots.length > 0)) {
      setPresentedRows(null);
      return;
    }

    let cancelled = false;
    void import("./schedule-presentation")
      .then(({ addOperatorPresentations }) => {
        if (!cancelled) setPresentedRows({ source: baseRows, rows: addOperatorPresentations(baseRows) });
      })
      .catch(() => {
        if (!cancelled) setPresentedRows(null);
      });
    return () => { cancelled = true; };
  }, [baseRows]);
  const rows = presentedRows?.source === baseRows ? presentedRows.rows : baseRows;
  const effectiveFiammettaEnabled = effectiveFiammettaSetting(operbox, rotationProfile, fiammettaEnabled);
  const setupConfigurationKey = useMemo(() => setupConfigurationFingerprint({
    layout,
    rotationProfile,
    fiammettaEnabled,
  }), [fiammettaEnabled, layout, rotationProfile]);
  const currentMoraleByOperator = useMemo(() => {
    if (!CLIENT_SKLAND_ENABLED || boxSource !== "skland" || !sklandScheduleSnapshot) return undefined;

    return new Map(
      sklandScheduleSnapshot.infrastructure.rooms.flatMap((room) =>
        room.operators.map((operator) => [operator.name, operator.morale] as const)
      )
    );
  }, [boxSource, sklandScheduleSnapshot]);
  const [closestComparison, setClosestComparison] = useState<ShiftComparison | null>(null);
  useEffect(() => {
    const maa = scheduleResult?.maa;
    const infrastructure = sklandScheduleSnapshot?.infrastructure;
    if (!CLIENT_SKLAND_ENABLED || !maa || !infrastructure) {
      setClosestComparison(null);
      return;
    }

    let cancelled = false;
    setClosestComparison(null);
    void import("./skland").then(({ closestShift, compareShifts }) => {
      if (!cancelled) setClosestComparison(closestShift(compareShifts(maa, infrastructure)));
    });
    return () => { cancelled = true; };
  }, [scheduleResult?.maa, sklandScheduleSnapshot?.infrastructure]);
  const sklandLayoutMatches = useMemo(() => {
    if (!CLIENT_SKLAND_ENABLED) return false;
    const suggestion = sklandScheduleSnapshot?.infrastructure.layoutSuggestion;
    if (!suggestion) return false;
    const compact = (value: BaseBlueprint) => value.rooms.map((room) => [room.id, room.kind, room.level, room.product]);
    return JSON.stringify(compact(layout)) === JSON.stringify(compact(suggestion));
  }, [layout, sklandScheduleSnapshot?.infrastructure.layoutSuggestion]);
  const activeSklandAccount = useMemo(
    () => CLIENT_SKLAND_ENABLED
      ? sklandAccounts.find((account) => account.accountId === sklandActiveAccountId) ?? null
      : null,
    [sklandAccounts, sklandActiveAccountId]
  );
  const accountCanUseCurrentBox = boxSource === "sample" || Boolean(websiteSession);
  const hasBox = Boolean(operbox?.length);
  const hasPersonalBox = hasBox && boxSource !== "sample";
  const feedbackDisabledForSampleBox = boxSource === "sample";
  const canRun = Boolean(
    operbox
    && operbox.length > 0
    && cliReady
    && accountCanUseCurrentBox
    && planRetryCountdown === 0
  );
  const sklandBindingCount = sklandBindingSummary.totalCount;
  const websiteUserId = websiteSession?.user.id ?? null;
  const accountCloudWorkspace = useAccountCloudWorkspace(CLIENT_ACCOUNT_CLOUD_SYNC_ENABLED ? {
    userId: websiteUserId,
    hasRestoredSession,
    hasLocalSession: hadPersistedSession.current,
    preset,
    setPreset,
    layout,
    setLayout,
    operbox,
    setOperbox,
    fileName,
    setFileName,
    boxSource,
    setBoxSource,
    layoutDirty,
    setLayoutDirty,
    layoutSource,
    setLayoutSource,
    localLayoutBackup,
    setLocalLayoutBackup,
    rotationProfile,
    setRotationProfile,
    fiammettaEnabled,
    setFiammettaEnabled,
    result,
    setResult,
    activeShift,
    setActiveShift,
  } : null);

  function beginSklandStateChange(): number {
    sklandFullRestore.current = null;
    sklandFullRestorePending.current = false;
    return sklandRestoreGuard.current.begin();
  }

  useEffect(() => {
    if (page === "calculator") hasRenderedCalculator.current = true;
  }, [page]);

  useEffect(() => {
    if (!hasRestoredSession) return;

    const frame = window.requestAnimationFrame(() => {
      for (const target of Object.keys(WORKBENCH_PAGE_PATHS) as AppPage[]) {
        if (target === page || (target === "skland" && !CLIENT_SKLAND_ENABLED)) continue;
        router.prefetch(workbenchHref(target));
      }
    });

    const preloadDeferredComponents = () => {
      void Promise.allSettled([
        loadWebsiteAccountDialog(),
        loadSetupDialog(),
        loadComponents(),
      ]);
    };
    const idleCallback = window.requestIdleCallback?.(preloadDeferredComponents, { timeout: 1_500 });
    const fallbackTimer = idleCallback === undefined
      ? window.setTimeout(preloadDeferredComponents, 250)
      : undefined;

    return () => {
      window.cancelAnimationFrame(frame);
      if (idleCallback !== undefined) window.cancelIdleCallback?.(idleCallback);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    };
  }, [hasRestoredSession, page, router]);

  useEffect(() => {
    if (setupOpen) setSetupMounted(true);
  }, [setupOpen]);

  useEffect(() => {
    if (websiteAuthDialogOpen) setWebsiteAuthDialogMounted(true);
  }, [websiteAuthDialogOpen]);

  useEffect(() => {
    if (issueOpen) setIssueModalMounted(true);
  }, [issueOpen]);

  useEffect(() => {
    if (pendingProductChange) setProductModalMounted(true);
  }, [pendingProductChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && loading) {
        void planTask.cancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, planTask]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const restored = loadPersistedSession(window.localStorage);
      hadPersistedSession.current = Boolean(restored);
      setOnboardingPreference(resolveOnboardingPreference(
        window.localStorage.getItem(ONBOARDING_STORAGE_KEY),
        Boolean(restored?.result),
      ));
      const warningDismissed = window.localStorage.getItem(RESULT_CLEAR_WARNING_DISMISSED_KEY) === "1";
      setResultClearWarningDismissed(warningDismissed);
      if (restored) {
        const restoredPreset = resolvePreset(PRESETS.find((item) => item.label === restored.presetLabel));
        const restoredLayout = restoreEditableProducts(buildBlueprint(restoredPreset), restored.layout);
        const restoredOperbox = restored.operbox ? normalizeOperboxEntries(restored.operbox) : null;
        setPreset(restoredPreset);
        setLayout(restoredLayout);
        const restoreAsLocalImport = !CLIENT_SKLAND_ENABLED && restored.boxSource === "skland";
        const restoredBoxSource = restoreAsLocalImport ? "maa" : restored.boxSource;
        const restoredSourceName = restoreAsLocalImport ? "已保存的干员数据" : restored.sourceName;
        const restoredLayoutSource = CLIENT_SKLAND_ENABLED ? restored.layoutSource : "local";
        setOperbox(restoredOperbox);
        setFileName(restoredSourceName);
        setBoxSource(restoredBoxSource);
        setLayoutDirty(restored.layoutDirty);
        setLayoutSource(restoredLayoutSource);
        setLocalLayoutBackup(CLIENT_SKLAND_ENABLED ? restored.localLayoutBackup : null);
        setRotationProfile(restored.rotationProfile);
        setFiammettaEnabled(Boolean(restored.fiammettaEnabled));
        setResult(restored.result);
        setActiveShift(restored.activeShift);
        initialLayoutForRestore.current = restoredLayout;
        initialBoxSource.current = restoredBoxSource;
        initialOperbox.current = restoredOperbox;
        initialLayoutDirty.current = restored.layoutDirty;
        initialLayoutSource.current = restoredLayoutSource;
        initialLocalLayoutBackup.current = CLIENT_SKLAND_ENABLED ? restored.localLayoutBackup : null;
      }
    } catch {
      setStorageNotice(displayError("AIC-LOCAL-7001", "浏览器无法读取本地数据，但仍可继续生成排班。"));
    } finally {
      setHasRestoredSession(true);
    }
  }, [setBoxSource, setOperbox]);

  useEffect(() => {
    if (!hasRestoredSession || typeof window === "undefined") return;
    if (skipNextPersistence.current) {
      skipNextPersistence.current = false;
      return;
    }
    try {
      persistSession(window.localStorage, {
        presetLabel: preset.label,
        layout,
        operbox,
        sourceName: fileName,
        boxSource,
        layoutDirty,
        layoutSource,
        localLayoutBackup,
        rotationProfile,
        fiammettaEnabled,
        result,
        activeShift,
      });
      setStorageNotice(null);
    } catch {
      setStorageNotice(displayError("AIC-LOCAL-7001", "浏览器无法保存本地数据，但仍可继续生成排班。"));
    }
  }, [hasRestoredSession, preset, layout, operbox, fileName, boxSource, layoutDirty, layoutSource, localLayoutBackup, rotationProfile, fiammettaEnabled, result, activeShift]);

  useEffect(() => {
    let cancelled = false;
    if (!hasRestoredSession) return;
    void getHealth()
      .then((health) => {
        if (cancelled) return;
        setSklandConfigured(Boolean(CLIENT_SKLAND_ENABLED && health.skland?.available));
        setSklandDisabledReason(CLIENT_SKLAND_ENABLED ? health.skland?.message ?? null : null);
        setTaskQueueEnabled(Boolean(health.taskQueue?.enabled));
        if (health.plannerReady) {
          setCliReady(true);
          setApiError(null);
        } else {
          setCliReady(false);
          setApiError(displayError("AIC-PLAN-3001", "排班服务暂不可用，请稍后重试。", true));
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setCliReady(false);
        setApiError(toDisplayError(error, "排班服务暂不可用，请稍后重试。"));
      });
    return () => {
      cancelled = true;
    };
  }, [hasRestoredSession]);

  useEffect(() => {
    if (
      !CLIENT_SKLAND_ENABLED
      || !hasRestoredSession
      || websiteSessionPending
      || !websiteUserId
    ) return;
    const generation = beginSklandStateChange();
    let cancelled = false;
    void getSklandAccounts("summary")
      .then((session) => {
        if (
          cancelled
          || !sklandRestoreGuard.current.canApplySummary(generation)
        ) return;
        setSklandConfigured(session.configured);
        setSklandDisabledReason(session.disabledReason ?? null);
        setSklandAccounts(session.accounts);
        setSklandActiveAccountId(session.activeAccountId);
        setSklandBindingSummary(bindingSummaryFromSession(session));
      })
      .catch(() => {
        // 摘要失败不清除已有身份；需要实时快照的页面会独立提供可操作错误。
      });
    return () => {
      cancelled = true;
    };
  }, [hasRestoredSession, websiteAuthReloadKey, websiteSessionPending, websiteUserId]);

  useEffect(() => {
    if (websiteSessionPending || !websiteSession || !websiteAuthDialogOpen) return;
    const intent = websiteAuthIntentRef.current;
    if (!intent) return;
    websiteAuthIntentRef.current = null;
    websiteAuthReturnFocusRef.current = null;
    setWebsiteAuthDialogOpen(false);
    websiteIntentContinuationRef.current(intent);
  }, [websiteAuthDialogOpen, websiteSession, websiteSessionPending]);

  useEffect(() => {
    if (!hasRestoredSession || websiteSessionPending) return;
    if (!CLIENT_SKLAND_ENABLED) {
      setSklandSessionLoading(false);
      return;
    }

    const generation = sklandRestoreGuard.current.current();
    let cancelled = false;
    statusLoadingAccount.current = null;

    if (!websiteUserId) {
      sklandRestoreGuard.current.acceptFull(generation);
      setSklandAccounts([]);
      setSklandActiveAccountId(null);
      setSklandBindingSummary(emptySklandBindingSummary());
      setSklandScheduleSnapshot(null);
      setSklandStatusSnapshot(null);
      setSklandError(null);
      setSklandSessionLoading(false);
      return;
    }

    const shouldLoadFullSklandSession = (
      page === "skland"
      || initialBoxSource.current === "skland"
      || !initialOperbox.current
      || setupOpen
    );
    if (!shouldLoadFullSklandSession) {
      setSklandSessionLoading(false);
      return;
    }

    sklandFullRestorePending.current = true;
    setSklandSessionLoading(true);
    let restore = sklandFullRestore.current;
    if (!restore || restore.generation !== generation) {
      restore = {
        generation,
        reloadKey: websiteAuthReloadKey,
        result: getSklandAccounts()
          .then((session) => ({ session }))
          .catch((error: unknown) => ({ error })),
      };
      sklandFullRestore.current = restore;
    }
    void restore.result
      .then((resolved) => {
        if ("error" in resolved) throw resolved.error;
        if (cancelled || !sklandRestoreGuard.current.acceptFull(generation)) return;
        const session = resolved.session;
        const bindingSummary = bindingSummaryFromSession(session);
        setSklandError(null);
        setSklandConfigured(session.configured);
        setSklandDisabledReason(session.disabledReason ?? null);
        setSklandAccounts(session.accounts);
        setSklandActiveAccountId(session.activeAccountId);
        setSklandBindingSummary(bindingSummary);
        setSklandStatusSnapshot(session.statusSnapshot ?? null);
        if (session.authenticated && session.scheduleSnapshot) {
          setSklandScheduleSnapshot(session.scheduleSnapshot);
          if (currentBoxSourceRef.current === "skland" || !currentOperboxRef.current?.length) {
            setOperbox(normalizeOperboxEntries(session.scheduleSnapshot.operbox));
            setFileName(session.scheduleSnapshot.sourceName);
            setBoxSource("skland");
          }
          if (
            !initialLayoutDirty.current
            && (initialBoxSource.current === "skland" || !initialOperbox.current)
            && session.scheduleSnapshot.infrastructure.layoutSuggestion
          ) {
            const suggestion = session.scheduleSnapshot.infrastructure.layoutSuggestion;
            setLayout(mergeSklandLayout(initialLayoutForRestore.current, suggestion));
            setLocalLayoutBackup(
              initialLayoutSource.current === "local"
                ? structuredClone(initialLayoutForRestore.current)
                : initialLocalLayoutBackup.current
            );
            setLayoutSource("skland");
            setPreset(resolvePreset(PRESETS.find((item) => item.label === session.scheduleSnapshot?.infrastructure.layoutLabel)));
          }
        } else {
          setSklandScheduleSnapshot(null);
          setSklandStatusSnapshot(null);
        }
      })
      .catch((error) => {
        if (cancelled || !sklandRestoreGuard.current.isCurrent(generation)) return;
        setSklandError(toDisplayError(error, "森空岛会话恢复失败，请稍后刷新。"));
      })
      .finally(() => {
        if (sklandFullRestore.current === restore) sklandFullRestorePending.current = false;
        if (!cancelled && sklandRestoreGuard.current.isCurrent(generation)) setSklandSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasRestoredSession, page, setBoxSource, setOperbox, setupOpen, websiteAuthReloadKey, websiteSessionPending, websiteUserId]);

  useEffect(() => {
    if (
      !CLIENT_SKLAND_ENABLED
      || page !== "skland"
      || !activeSklandAccount
      || sklandStatusSnapshot
      || sklandFullRestorePending.current
      || sklandSessionLoading
      || sklandError
      || statusLoadingAccount.current === activeSklandAccount.accountId
    ) return;
    let cancelled = false;
    statusLoadingAccount.current = activeSklandAccount.accountId;
    setSklandBusy(true);
    void refreshSklandStatus()
      .then((status) => {
        if (cancelled) return;
        setSklandAccounts(status.accounts);
        setSklandActiveAccountId(status.activeAccountId);
        setSklandStatusSnapshot(status.snapshot ?? null);
        setSklandError(null);
      })
      .catch((error) => {
        if (!cancelled) setSklandError(toDisplayError(error, "状态中心加载失败，请稍后重试。"));
      })
      .finally(() => {
        statusLoadingAccount.current = null;
        if (!cancelled) setSklandBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSklandAccount, page, sklandError, sklandSessionLoading, sklandStatusReloadKey, sklandStatusSnapshot]);

  async function handleFile(file: File): Promise<boolean> {
    setInputError(null);
    setResult(null);
    clearIssueState();
    try {
      const { readOperboxFile } = await import("./operbox");
      const entries = await readOperboxFile(file);
      setOperbox(entries);
      setFileName(file.name);
      setBoxSource("maa");
      return true;
    } catch (error) {
      setInputError(locale === "en"
        ? "Could not parse the operator file. Check the file and try again."
        : error instanceof Error ? error.message : "练度文件解析失败。");
      setInputErrorCode("AIC-BOX-1101");
      return false;
    }
  }

  function applySklandSnapshot(snapshot: SklandScheduleSnapshot, applyLayoutWhenClean = true) {
    setSklandScheduleSnapshot(snapshot);
    setOperbox(normalizeOperboxEntries(snapshot.operbox));
    setFileName(snapshot.sourceName);
    setBoxSource("skland");
    setInputMode("skland");
    clearPlanResult();
    if (applyLayoutWhenClean && !layoutDirty && snapshot.infrastructure.layoutSuggestion) {
      if (layoutSource === "local") setLocalLayoutBackup(structuredClone(layout));
      setLayout((current) => mergeSklandLayout(current, snapshot.infrastructure.layoutSuggestion as BaseBlueprint));
      setLayoutSource("skland");
      setPreset(resolvePreset(PRESETS.find((item) => item.label === snapshot.infrastructure.layoutLabel)));
      setLayoutDirty(false);
    }
  }

  function applySklandSession(session: SklandSessionData, applyLayoutWhenClean = true) {
    setSklandAccounts(session.accounts);
    setSklandActiveAccountId(session.activeAccountId);
    setSklandBindingSummary(bindingSummaryFromSession(session));
    setSklandStatusSnapshot(session.statusSnapshot ?? null);
    if (session.authenticated && session.scheduleSnapshot) {
      applySklandSnapshot(session.scheduleSnapshot, applyLayoutWhenClean);
      return;
    }
    setSklandScheduleSnapshot(null);
    if (boxSource === "skland") {
      setOperbox(null);
      setFileName(null);
      setBoxSource("sample");
      clearPlanResult();
    }
  }

  async function handleMaaPaste(): Promise<boolean> {
    setInputError(null);
    try {
      const { readOperboxText } = await import("./operbox");
      const entries = await readOperboxText(maaPaste);
      setOperbox(entries);
      setFileName(locale === "en" ? "Pasted Arknights_OperBox_Export.json" : "粘贴的 Arknights_OperBox_Export.json");
      setBoxSource("maa");
      clearPlanResult();
      return true;
    } catch (error) {
      setInputError(locale === "en"
        ? "Could not parse the MAA JSON. Paste the complete export and try again."
        : error instanceof Error ? error.message : "MAA JSON 解析失败。");
      setInputErrorCode("AIC-BOX-1101");
      return false;
    }
  }

  function handleManualBox(entries: OperBoxEntry[]) {
    setInputError(null);
    setOperbox(normalizeOperboxEntries(entries));
    setFileName(locale === "en" ? "Manually selected BOX" : "手动选择的 Box");
    setBoxSource("maa");
    clearPlanResult();
  }

  async function handleSklandRole(accountId: string, uid: string) {
    const generation = beginSklandStateChange();
    setSklandBusy(true);
    setSklandError(null);
    try {
      const session = await selectSklandRole(accountId, uid);
      if (!sklandRestoreGuard.current.isCurrent(generation)) return;
      if (!session.authenticated || !session.scheduleSnapshot) throw new Error("角色切换失败。");
      sklandRestoreGuard.current.acceptFull(generation);
      applySklandSession(session, false);
    } catch (error) {
      if (!sklandRestoreGuard.current.isCurrent(generation)) return;
      const normalized = toDisplayError(error, "角色切换失败，请稍后重试。");
      setSklandError(normalized);
      try {
        const current = await getSklandAccounts();
        if (!sklandRestoreGuard.current.acceptFull(generation)) return;
        setSklandAccounts(current.accounts);
        setSklandActiveAccountId(current.activeAccountId);
        setSklandStatusSnapshot(current.statusSnapshot ?? null);
        if (current.authenticated && current.scheduleSnapshot) applySklandSnapshot(current.scheduleSnapshot, false);
      } catch {
        // 保留上一份成功快照，等待用户再次操作。
      }
    } finally {
      if (sklandRestoreGuard.current.isCurrent(generation)) setSklandBusy(false);
    }
  }

  async function handleSklandLogout() {
    if (!sklandActiveAccountId) return;
    const generation = beginSklandStateChange();
    setSklandBusy(true);
    setSklandError(null);
    try {
      const session = await deleteSklandAccount(sklandActiveAccountId);
      if (!sklandRestoreGuard.current.acceptFull(generation)) return;
      applySklandSession(session, false);
    } catch (error) {
      if (!sklandRestoreGuard.current.isCurrent(generation)) return;
      const normalized = toDisplayError(error, "退出森空岛失败，请稍后重试。");
      setSklandError(normalized);
    } finally {
      if (sklandRestoreGuard.current.isCurrent(generation)) setSklandBusy(false);
    }
  }

  function handleApplySklandLayout() {
    const suggestion = sklandScheduleSnapshot?.infrastructure.layoutSuggestion;
    if (!suggestion) return;
    if (layoutSource === "local") setLocalLayoutBackup(structuredClone(layout));
    setLayout((current) => mergeSklandLayout(current, suggestion));
    setLayoutSource("skland");
    setPreset(resolvePreset(PRESETS.find((item) => item.label === sklandScheduleSnapshot.infrastructure.layoutLabel)));
    setLayoutDirty(false);
    clearPlanResult();
  }

  async function runPlanForLayout(
    planLayout: BaseBlueprint,
    retryUnavailable = false,
    planInput: { operbox: OperBoxEntry[] | null; sourceName: string | null; boxSource: BoxSource } = {
      operbox,
      sourceName: fileName,
      boxSource,
    },
  ): Promise<boolean> {
    if (!planInput.operbox) return false;
    if (planRetryCountdown > 0) return false;
    planClickAtRef.current = performance.now();
    trackTelemetry({ type: "interaction", name: "plan_click", page: "calculator" });
    const layoutError = layoutValidationError(planLayout);
    if (layoutError) {
      setApiError(displayError("AIC-LAYOUT-1201", layoutError));
      return false;
    }
    if (!cliReady && !retryUnavailable) {
      setApiError(displayError("AIC-PLAN-3001", "排班服务暂不可用，请稍后重试。", true));
      return false;
    }
    void import("@/product-assets").then(({ preloadProductIcons }) => preloadProductIcons());
    setLoading(true);
    setResultClearNotice(null);
    setInputError(null);
    setApiError(null);
    clearIssueState();

    try {
      trackTelemetry({ type: "interaction", name: "plan_submit", page: "calculator" });
      const payload = {
        layout: planLayout,
        operbox: normalizeOperboxEntries(planInput.operbox),
        sourceName: planInput.sourceName,
        boxSource: planInput.boxSource,
        rotation: rotationProfile,
        fiammetta_enable: effectiveFiammettaSetting(planInput.operbox, rotationProfile, fiammettaEnabled),
      };
      if (!taskQueueEnabled || payload.boxSource === "sample") {
        planTask.complete(await computePlan(payload));
        return true;
      }
      const submitted = await submitPlanTask(payload);
      if (submitted.status === "done") planTask.complete(submitted.result);
      else planTask.begin(submitted);
      return true;
    } catch (error) {
      const normalized = toDisplayError(error, "排班请求失败，请稍后重试。");
      setApiError(normalized);
      if (normalized.retryAfterSeconds) startPlanRetryCooldown(normalized.retryAfterSeconds);
      setLoading(false);
      return false;
    }
  }

  function handleCancelRun() {
    void planTask.cancel().then((cancelled) => {
      if (cancelled) setApiError(null);
    });
  }

  async function handleRun() {
    await runPlanForLayout(layout);
  }

  async function handleRunSampleTrial(): Promise<boolean> {
    if (sampleTrialInFlightRef.current) return false;
    sampleTrialInFlightRef.current = true;
    setSampleLoading(true);
    setInputError(null);
    setResult(null);
    clearIssueState();
    try {
      const sample = await getSampleOperbox();
      const sampleOperbox = normalizeOperboxEntries(sample.operbox);
      setOperbox(sampleOperbox);
      setFileName(sample.sourceName);
      setBoxSource("sample");
      return await runPlanForLayout(layout, false, {
        operbox: sampleOperbox,
        sourceName: sample.sourceName,
        boxSource: "sample",
      });
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "样例数据读取失败。");
      const normalized = toDisplayError(error, "示例数据读取失败，请稍后重试。");
      setInputErrorCode(normalized.code);
      setApiError(normalized);
      return false;
    } finally {
      sampleTrialInFlightRef.current = false;
      setSampleLoading(false);
    }
  }

  async function handleDownloadMaa() {
    if (!result?.maa) return;
    const { downloadJson } = await import("./download");
    downloadJson("arknights-infra-schedule-maa.json", result.maa);
  }

  function clearIssueState() {
    setIssueDraftKind("room_issue");
    setIssueDraftRow(null);
    setIssueDraftNote("");
    setIssueOpen(false);
    setFeedbackResult(null);
  }

  function handleMarkIssue(row: RoomRow) {
    if (feedbackDisabledForSampleBox) return;
    setIssueDraftKind("room_issue");
    setIssueDraftRow(row);
    setIssueDraftNote("");
    setFeedbackResult(null);
    setIssueOpen(true);
  }

  function handlePerformanceIssue() {
    if (feedbackDisabledForSampleBox) return;
    if (!result?.diagnosticId) return;
    setIssueDraftKind("performance_issue");
    setIssueDraftRow(null);
    setIssueDraftNote("本次求解耗时明显偏长。");
    setFeedbackResult(null);
    setIssueOpen(true);
  }

  async function handleSaveIssue() {
    if (!issueDraftNote.trim() || (issueDraftKind === "room_issue" && !issueDraftRow)) return;
    if (!result?.diagnosticId) {
      setApiError(displayError("AIC-FEEDBACK-4001", "请先生成排班，再提交问题。"));
      return;
    }

    const environment = [
      `求解耗时：${Math.round(result.durationMs)} ms`,
      `班次：${activeShift + 1}`,
      `换班方式：${rotationProfile}`,
      `布局：${preset.label}`,
    ].join("；");
    const note = `${issueDraftNote.trim()}\n\n[运行环境] ${environment}`;

    setFeedbackSaving(true);
    setApiError(null);
    try {
      let response: FeedbackData;
      if (issueDraftKind === "performance_issue") {
        response = await saveFeedback({
          kind: "performance_issue",
          diagnosticId: result.diagnosticId,
          note,
          consent: true,
        });
      } else {
        const row = issueDraftRow;
        if (!row) return;
        response = await saveFeedback({
          kind: "room_issue",
          diagnosticId: result.diagnosticId,
          room: {
            id: row.roomId,
            title: row.title,
            group: row.group,
            operators: row.operators,
          },
          note,
          consent: true,
        });
      }
      setFeedbackResult(response);
      setIssueOpen(false);
      setIssueDraftKind("room_issue");
      setIssueDraftRow(null);
      setIssueDraftNote("");
    } catch (error) {
      const normalized = toDisplayError(error, "反馈保存失败，请稍后重试。");
      setApiError(normalized);
    } finally {
      setFeedbackSaving(false);
    }
  }

  function handleCancelIssue() {
    setIssueOpen(false);
    setIssueDraftKind("room_issue");
    setIssueDraftRow(null);
    setIssueDraftNote("");
  }

  function clearPlanResult() {
    setResult(null);
    setActiveShift(0);
    clearIssueState();
  }

  function handleRotationProfileChange(value: RotationProfile) {
    setRotationProfile(value);
    clearPlanResult();
  }

  function handleFiammettaEnabledChange(enabled: boolean) {
    setFiammettaEnabled(enabled);
    clearPlanResult();
  }

  function applyPartialLocalLayoutEdit(patch: (layout: BaseBlueprint) => BaseBlueprint): BaseBlueprint {
    const next = applyLocalLayoutPatch({ layout, layoutSource, localLayoutBackup }, patch, defaultLayout);
    setLayout(next.layout);
    setLayoutSource(next.layoutSource);
    setLocalLayoutBackup(next.localLayoutBackup);
    setLayoutDirty(true);
    clearPlanResult();
    return next.layout;
  }

  function applyProductChange(change: ProductChange) {
    applyPartialLocalLayoutEdit((current) => layoutWithProductChange(current, change));
  }

  function productChangeLabel(change: ProductChange) {
    if (change.type === "factory") {
      return FACTORY_RECIPE_OPTIONS.find((option) => option.value === change.recipe)?.label;
    }
    return TRADE_ORDER_OPTIONS.find((option) => option.value === change.order)?.label;
  }

  function showResultClearNotice(label: string | undefined) {
    if (resultClearWarningDismissed || !result) return;
    setResultClearNotice(label ? `已切换到：${label}` : "配置已切换");
  }

  function requestProductChange(change: ProductChange) {
    showResultClearNotice(productChangeLabel(change));
    applyProductChange(change);
  }

  function requestScheduleProductChange(change: ProductChange) {
    if (loading || pendingProductChange) return;
    if (!result) {
      requestProductChange(change);
      return;
    }
    setResultClearNotice(null);
    setPendingProductChange(change);
  }

  async function confirmScheduleProductChange() {
    if (!pendingProductChange || loading) return;
    const nextLayout = applyPartialLocalLayoutEdit(
      (current) => layoutWithProductChange(current, pendingProductChange)
    );
    try {
      await runPlanForLayout(nextLayout);
    } finally {
      setPendingProductChange(null);
    }
  }

  function dismissResultClearWarning() {
    setResultClearWarningDismissed(true);
    setResultClearNotice(null);
    try {
      window.localStorage.setItem(RESULT_CLEAR_WARNING_DISMISSED_KEY, "1");
    } catch {
      // The current session can still honor the preference when storage is unavailable.
    }
  }

  function restoreResultClearWarning() {
    setResultClearWarningDismissed(false);
    try {
      window.localStorage.removeItem(RESULT_CLEAR_WARNING_DISMISSED_KEY);
    } catch {
      // The in-memory preference has already been restored.
    }
  }

  function handlePresetSelect(nextPreset: PresetDef) {
    showResultClearNotice(`布局 ${nextPreset.label}`);
    setPreset(nextPreset);
    setLayout(buildBlueprint(nextPreset));
    setLayoutDirty(true);
    setLayoutSource("local");
    setLocalLayoutBackup(null);
    clearPlanResult();
  }

  function handleFactoryRecipeChange(roomId: string, recipe: FactoryRecipe) {
    requestProductChange({ type: "factory", roomId, recipe });
  }

  function handleTradeOrderChange(roomId: string, order: TradeOrder) {
    requestProductChange({ type: "trade", roomId, order });
  }

  function handleScheduleFactoryRecipeChange(roomId: string, recipe: FactoryRecipe) {
    requestScheduleProductChange({ type: "factory", roomId, recipe });
  }

  function handleScheduleTradeOrderChange(roomId: string, order: TradeOrder) {
    requestScheduleProductChange({ type: "trade", roomId, order });
  }

  function handleRoomLevelChange(roomId: string, level: number) {
    applyPartialLocalLayoutEdit((current) => updateRoomLevel(current, roomId, level));
  }

  async function handleLayoutFile(file: File) {
    try {
      const parsed = parseLayoutJson(JSON.parse(await file.text()));
      if (!parsed) throw new Error("布局文件格式无效，请检查房间名称、类型和设施等级。");
      setLayout(parsed);
      setLayoutDirty(true);
      setLayoutSource("local");
      setLocalLayoutBackup(null);
      clearPlanResult();
      setInputError(null);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "布局 JSON 读取失败。");
      setInputErrorCode("AIC-LAYOUT-1201");
    }
  }

  function persistOnboardingPreference(value: OnboardingPreference) {
    setOnboardingPreference(value);
    try {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        value === "completed" ? ONBOARDING_COMPLETED_VALUE : ONBOARDING_DISMISSED_VALUE,
      );
    } catch {
      // The current page can still honor the preference when storage is unavailable.
    }
  }

  function dismissOnboarding() {
    persistOnboardingPreference("dismissed");
  }

  function completeOnboarding() {
    persistOnboardingPreference("completed");
  }

  function openSetup() {
    setSetupOpen(true);
  }

  function handleSetupOpenChange(next: boolean) {
    setSetupOpen(next);
    if (!next) setInputError(null);
  }

  function closeSetup() {
    setInputError(null);
    setSetupOpen(false);
  }

  function openSklandFromSetup() {
    setInputError(null);
    setSetupOpen(false);
    navigateToPage("skland");
  }

  function handleAppPageChange(nextPage: AppPage, trigger?: HTMLElement): boolean {
    if ((nextPage === "account" || nextPage === "skland") && !websiteSession) {
      requestWebsiteAccount(nextPage, trigger);
      return false;
    }
    if (nextPage === "calculator") hasRenderedCalculator.current = true;
    return true;
  }

  function requestWebsiteAccount(intent: WebsiteAuthIntent, trigger?: HTMLElement | null) {
    websiteAuthIntentRef.current = intent;
    websiteAuthReturnFocusRef.current = trigger ?? document.activeElement as HTMLElement | null;
    setWebsiteAuthDialogOpen(true);
  }

  function handleWebsiteAuthDialogOpenChange(open: boolean) {
    if (websiteAuthFocusReturnTimerRef.current !== null) {
      window.clearTimeout(websiteAuthFocusReturnTimerRef.current);
      websiteAuthFocusReturnTimerRef.current = null;
    }
    setWebsiteAuthDialogOpen(open);
    if (open) return;
    websiteAuthIntentRef.current = null;
    const trigger = websiteAuthReturnFocusRef.current;
    websiteAuthReturnFocusRef.current = null;
    websiteAuthFocusReturnTimerRef.current = window.setTimeout(() => {
      websiteAuthFocusReturnTimerRef.current = null;
      const focusTarget = trigger?.isConnected
        ? trigger
        : document.querySelector<HTMLElement>('[data-primary-navigation-page="account"]');
      focusTarget?.focus();
    }, WEBSITE_AUTH_FOCUS_RETURN_DELAY_MS);
  }

  function navigateToPage(nextPage: AppPage) {
    if (!handleAppPageChange(nextPage)) return;
    router.push(workbenchHref(nextPage));
  }

  async function handleWebsiteSessionChanged(authenticated: boolean) {
    beginSklandStateChange();
    if (!authenticated) {
      websiteAuthIntentRef.current = null;
      websiteAuthReturnFocusRef.current = null;
      setWebsiteAuthDialogOpen(false);
      router.push(workbenchHref("calculator"));
      setSklandAccounts([]);
      setSklandActiveAccountId(null);
      setSklandBindingSummary(emptySklandBindingSummary());
      setSklandScheduleSnapshot(null);
      setSklandStatusSnapshot(null);
      setSklandError(null);
    }
    await refetchWebsiteSession();
    setWebsiteAuthReloadKey((current) => current + 1);
  }

  function handleStartPersonalFlow() {
    if (!websiteSession) {
      requestWebsiteAccount(hasPersonalBox ? "run" : "setup");
      return;
    }
    if (hasPersonalBox) {
      void handleRun();
      return;
    }
    openSetup();
  }

  function handleProtectedSetup() {
    if (!websiteSession) {
      requestWebsiteAccount("setup");
      return;
    }
    openSetup();
  }

  function handleProtectedRun() {
    if (hasPersonalBox && !websiteSession) {
      requestWebsiteAccount("run");
      return;
    }
    if (!canRun) return;
    void handleRun();
  }

  function requireWebsiteAccountFromSetup() {
    setSetupOpen(false);
    requestWebsiteAccount("setup");
  }

  websiteIntentContinuationRef.current = (intent) => {
    if (intent === "setup") {
      setSetupOpen(true);
      return;
    }
    if (intent === "run") {
      if (cliReady) void handleRun();
      return;
    }
    router.push(workbenchHref(intent === "skland" ? "skland" : "account"));
  };

  function useSklandSnapshotFromSetup() {
    if (sklandScheduleSnapshot) applySklandSnapshot(sklandScheduleSnapshot);
  }

  function handleSklandAuthenticated(session: SklandSessionData) {
    const generation = beginSklandStateChange();
    sklandRestoreGuard.current.acceptFull(generation);
    setSklandError(null);
    applySklandSession(session);
  }

  function handleRetrySklandStatus() {
    setSklandError(null);
    statusLoadingAccount.current = null;
    setSklandStatusReloadKey((current) => current + 1);
  }

  async function handleDeleteAllSklandData() {
    const generation = beginSklandStateChange();
    setSklandBusy(true);
    setSklandError(null);
    try {
      await deleteAllSklandAccountData();
      if (!sklandRestoreGuard.current.acceptFull(generation)) return;
      const clearsBox = boxSource === "skland";
      const clearsLayout = layoutSource === "skland";
      const retainedLayout = clearsLayout
        ? localLayoutBackup ?? buildBlueprint(defaultPreset)
        : layout;
      const retainedPreset = clearsLayout
        ? resolvePreset(PRESETS.find((item) => item.label === retainedLayout.template))
        : preset;
      const retainedResult = clearsBox || clearsLayout ? null : result;
      try {
        persistSession(window.localStorage, {
          presetLabel: retainedPreset.label,
          layout: retainedLayout,
          operbox: clearsBox ? null : operbox,
          sourceName: clearsBox ? null : fileName,
          boxSource: clearsBox ? "sample" : boxSource,
          layoutDirty: clearsLayout ? false : layoutDirty,
          layoutSource: "local",
          localLayoutBackup: null,
          rotationProfile,
          result: retainedResult,
          activeShift: retainedResult ? activeShift : 0,
        });
      } catch {
        clearLocalProductData(window.localStorage);
        setStorageNotice(displayError(
          "AIC-LOCAL-7001",
          "浏览器无法保留独立导入数据，已改为清除整份本地会话以确保森空岛数据不再保留。"
        ));
      }
      setSklandAccounts([]);
      setSklandActiveAccountId(null);
      setSklandBindingSummary(emptySklandBindingSummary());
      setSklandScheduleSnapshot(null);
      setSklandStatusSnapshot(null);
      if (clearsBox) {
        setOperbox(null);
        setFileName(null);
        setBoxSource("sample");
        setResult(null);
        setActiveShift(0);
      }
      if (clearsLayout) {
        setPreset(retainedPreset);
        setLayout(retainedLayout);
        setLayoutSource("local");
        setLocalLayoutBackup(null);
        setLayoutDirty(false);
        setResult(null);
        setActiveShift(0);
      }
      clearIssueState();
    } catch (error) {
      if (!sklandRestoreGuard.current.isCurrent(generation)) return;
      setSklandError(toDisplayError(error, "森空岛数据删除失败，请稍后重试。"));
      throw error;
    } finally {
      if (sklandRestoreGuard.current.isCurrent(generation)) setSklandBusy(false);
    }
  }

  function handleClearLocalData() {
    try {
      clearLocalProductData(window.localStorage, [ONBOARDING_STORAGE_KEY]);
      skipNextPersistence.current = true;
      setPreset(defaultPreset);
      setLayout(buildBlueprint(defaultPreset));
      setOperbox(null);
      setFileName(null);
      setBoxSource("sample");
      setLayoutDirty(false);
      setLayoutSource("local");
      setLocalLayoutBackup(null);
      setRotationProfile(DEFAULT_ROTATION_PROFILE);
      setResult(null);
      setActiveShift(0);
      setResultClearWarningDismissed(false);
      setOnboardingPreference("active");
      setStorageNotice(null);
      clearIssueState();
    } catch {
      setStorageNotice(displayError("AIC-LOCAL-7001", "浏览器无法清除本地数据，请检查站点存储权限。"));
    }
  }

  async function handleRetry() {
    if (planRetryCountdown > 0) return;
    if (apiError?.code === "AIC-PLAN-3001") {
      await runPlanForLayout(layout, true);
      return;
    }
    if (canRun) {
      await handleRun();
      return;
    }
    try {
      const health = await getHealth();
      setCliReady(health.plannerReady);
      setTaskQueueEnabled(Boolean(health.taskQueue?.enabled));
      setApiError(
        health.plannerReady
          ? null
          : displayError("AIC-PLAN-3001", "排班服务暂不可用，请稍后重试。", true)
      );
    } catch (error) {
      setApiError(toDisplayError(error, "排班服务暂不可用，请稍后重试。"));
    }
  }

  const statusError = inputError && !setupOpen
    ? displayError(inputErrorCode, inputError)
    : apiError ?? storageNotice;
  const activity = usePlanActivity({
    loading,
    error: statusError,
    completed: planTask.status === "done",
    queued: loading && (
      planTask.status === "buffered"
      || planTask.status === "pending"
      || planTask.pollStopped
    ),
    queuePosition: planTask.queuePosition,
    etaSeconds: planTask.etaSeconds,
    buffered: planTask.status === "buffered",
  });
  useEffect(() => {
    if (page !== "calculator" || !result?.maa) return;
    let cancelled = false;
    let cancelPreload: (() => void) | undefined;
    void loadClientFeature("schedulePortraitPreload").then((module) => {
      if (!cancelled) cancelPreload = module.scheduleNextShiftPortraitPreload(result.maa, activeShift);
    });
    return () => {
      cancelled = true;
      cancelPreload?.();
    };
  }, [activeShift, page, result?.maa]);
  const visiblePlanRevision = scheduleResult?.diagnosticId;
  const animatePlanEntrance = Boolean(
    page === "calculator"
    && visiblePlanRevision
    && !revealedPlanRevisions.current.has(visiblePlanRevision)
  );
  const animateEmptyScheduleEntrance = page === "calculator" && hasRenderedCalculator.current;
  const workbenchContext = {
    calculator: {
      layout,
      result,
      scheduleResult,
      activeShift,
      rows,
      currentMoraleByOperator,
      activePlan,
      closestComparison,
      resultClearNotice,
      feedbackResult,
      sampleLoading,
      loading,
      canRun,
      runCooldownSeconds: planRetryCountdown,
      hasBox,
      hasPersonalBox,
      feedbackDisabledForSampleBox,
      plannerReady: cliReady,
      websiteAuthenticated: Boolean(websiteSession),
      showOnboarding: onboardingPreference === "active" && !result,
      taskQueue: loading && planTask.taskId ? {
        queuePosition: planTask.queuePosition,
        etaSeconds: planTask.etaSeconds,
        pollStopped: planTask.pollStopped,
        error: planTask.error,
        resumeDisabled: planTask.resumeDisabled,
        resumeCountdown: planTask.resumeCountdown,
        onResumePoll: planTask.resume,
      } : null,
      animatePlanEntrance,
      animateEmptyScheduleEntrance,
      onPlanEntranceConsumed: (revision: string) => {
        revealedPlanRevisions.current.add(revision);
        // 只统计"本次生成"的首次渲染；切班次/重挂载不再重复打点。
        if (planClickAtRef.current !== null) {
          trackTelemetry({
            type: "interaction",
            name: "plan_render",
            page: "calculator",
            durationMs: Math.max(0, Math.round(performance.now() - planClickAtRef.current)),
          });
          planClickAtRef.current = null;
        }
      },
      requiresAccount: !accountCanUseCurrentBox,
      accountControl: CLIENT_SKLAND_ENABLED && activeSklandAccount ? (
        <SklandAccountControl
          account={activeSklandAccount}
          statusSnapshot={sklandStatusSnapshot}
          onOpenSkland={() => navigateToPage("skland")}
        />
      ) : undefined,
      onRunSampleTrial: handleRunSampleTrial,
      onStartPersonalFlow: handleStartPersonalFlow,
      onDismissOnboarding: dismissOnboarding,
      onOpenSetup: handleProtectedSetup,
      onRun: handleProtectedRun,
      onCancelRun: handleCancelRun,
      onSetActiveShift: setActiveShift,
      onMarkIssue: handleMarkIssue,
      onPerformanceIssue: handlePerformanceIssue,
      onFactoryRecipeChange: handleScheduleFactoryRecipeChange,
      onTradeOrderChange: handleScheduleTradeOrderChange,
      onDownloadMaa: handleDownloadMaa,
      onClearResultNotice: () => setResultClearNotice(null),
      onDismissResultClearWarning: dismissResultClearWarning,
    },
    training: {
      operbox: accountCanUseCurrentBox ? operbox : null,
      layout,
      profile: accountCanUseCurrentBox ? result?.profile : null,
      trainingAdvice: accountCanUseCurrentBox ? result?.trainingAdvice ?? null : null,
      requiresAccount: !accountCanUseCurrentBox,
      onOpenCalculator: () => navigateToPage("calculator"),
    },
    account: {
      authenticated: Boolean(websiteSession),
      pending: websiteSessionPending,
      onSessionChanged: handleWebsiteSessionChanged,
      ...(CLIENT_ACCOUNT_CLOUD_SYNC_ENABLED ? {
        cloudWorkspace: accountCloudWorkspace.cloudWorkspaceData,
        onRestoreSavedPlan: (saved: SavedPlanData) => {
          const context = saved.calculationContext;
          if (!context) return;
          const restoredPreset = resolvePreset(PRESETS.find((item) => item.label === context.presetLabel));
          const restoredLayout = structuredClone(context.layout);
          setPreset(restoredPreset);
          setLayout(restoredLayout);
          setLayoutDirty(JSON.stringify(restoredLayout) !== JSON.stringify(buildBlueprint(restoredPreset)));
          setLayoutSource("local");
          setLocalLayoutBackup(null);
          setRotationProfile(context.rotationProfile);
          setFiammettaEnabled(context.fiammettaEnabled);
          setResult(saved.result);
          setActiveShift(0);
          router.push(workbenchHref("calculator"));
        },
        onCloudDataChanged: accountCloudWorkspace.refreshCloudData,
      } : {}),
    },
    skland: CLIENT_SKLAND_ENABLED ? {
      websiteAuthenticated: Boolean(websiteSession),
      websiteSessionPending,
      bindingSummary: sklandBindingSummary,
      onOpenAccount: () => navigateToPage("account"),
      skland: {
        scheduleSnapshot: sklandScheduleSnapshot,
        snapshot: sklandStatusSnapshot,
        accounts: sklandAccounts,
        activeAccountId: sklandActiveAccountId,
        bindingCount: sklandBindingCount,
        sessionLoading: sklandSessionLoading,
        layoutMatches: sklandLayoutMatches ?? false,
        layoutDirty,
        configured: sklandConfigured,
        disabledReason: sklandDisabledReason,
        busy: sklandBusy,
        error: sklandError,
        onAuthenticated: handleSklandAuthenticated,
        onRoleChange: handleSklandRole,
        onLogout: handleSklandLogout,
        onRetryStatus: handleRetrySklandStatus,
        onDeleteAllData: handleDeleteAllSklandData,
        onApplyLayout: handleApplySklandLayout,
        onContinueSetup: () => {
          setSetupOpen(true);
        },
        onOpenCalculator: () => navigateToPage("calculator"),
        onCopyUid: (uid: string) => {
          void import("./download").then(({ copyText }) => copyText(uid));
        },
      },
    } : null,
  };

  return (
    <AppMotionProvider>
      <TooltipProvider>
    <div
      className="contents"
      data-workbench-hydrated={hasRestoredSession ? "true" : "false"}
      onKeyDown={(event) => {
        if (event.key === "Escape" && websiteAuthDialogOpen) handleWebsiteAuthDialogOpenChange(false);
      }}
    >
    <SidebarProvider defaultOpen={false}>
      <AppSidebar page={page} onPageChange={handleAppPageChange} />
      <SidebarInset>
        <AppTopBar />
        <LiveActivity
          activity={activity}
          onRetry={() => void handleRetry()}
          retryCountdownSeconds={planRetryCountdown}
          onCopyDiagnostic={() => {
            const error = activity?.error;
            if (!error) return;
            void Promise.all([import("./download"), import("./solver-diagnostic")])
              .then(([{ copyText }, { formatSolverDiagnostic }]) => copyText(formatSolverDiagnostic(error)));
          }}
        />

      <div
        className={page === "calculator" && !scheduleResult && onboardingPreference === "active"
          ? "w-full flex-1"
          : "app-content-track py-4"}
        data-app-content
        inert={!hasRestoredSession}
        aria-busy={!hasRestoredSession}
      >
      <WorkbenchContext.Provider value={workbenchContext}>
        <PrimaryPageTransition pageKey={page}>{children}</PrimaryPageTransition>
      </WorkbenchContext.Provider>
      </div>

      <footer className="app-content-track mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 py-5 text-xs text-muted-foreground">
        <LanguageDemoSwitch />
        <Link prefetch={false} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/help" data-help-link>{locale === "en" ? "Help" : "使用帮助"}</Link>
        <Link prefetch={false} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/terms">{locale === "en" ? "Terms" : "本站服务条款"}</Link>
        <Link prefetch={false} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/privacy">{locale === "en" ? "Privacy" : "本站隐私政策"}</Link>
        <a className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/about" data-about-link>{locale === "en" ? "About" : "关于我们"}</a>
        <div className="ml-auto flex shrink-0 items-center gap-3 max-sm:ml-0 max-sm:w-full max-sm:justify-end">
          <a className="whitespace-nowrap underline underline-offset-4 hover:text-foreground" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" data-ui-number-font>沪ICP备2026041492号</a>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          <a
            href="https://www.rainyun.com/riic_"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={locale === "en" ? "Sponsored by Rainyun (opens in a new tab)" : "由雨云提供赞助（在新标签页打开雨云官网）"}
            data-rainyun-link
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-1 text-[11px] leading-none opacity-70 outline-none transition-[opacity,transform] duration-180 ease-[var(--motion-ease-out)] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="block leading-none" data-rainyun-copy>{locale === "en" ? "Sponsored by" : "由"}</span>
            <img
              src="/images/partners/rainyun-logo.png"
              alt=""
              width={1120}
              height={390}
              loading="eager"
              decoding="async"
              className="block h-5 w-14 object-contain sm:h-[23px] sm:w-16"
            />
            {locale === "en" ? null : <span className="block leading-none">提供赞助</span>}
          </a>
        </div>
      </footer>

      {CLIENT_ACCOUNT_CLOUD_SYNC_ENABLED ? accountCloudWorkspace.syncElement : null}

      {websiteAuthDialogMounted ? <Suspense fallback={(
        websiteAuthDialogOpen ? (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-2"
          >
            <div
              className="grid min-h-72 w-full max-w-[min(880px,calc(100vw-2rem))] place-items-center bg-background px-6 py-12 text-center shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-label={locale === "en" ? "Website account sign-in" : "登录网站账号"}
              aria-busy="true"
              data-website-account-dialog
              data-website-account-dialog-loading
            >
              <div className="grid justify-items-center gap-3" role="status" aria-live="polite" aria-busy="true" data-website-account-loading>
                <span
                  className="size-8 animate-spin rounded-full border-2 border-muted border-t-muted-foreground motion-reduce:animate-none"
                  aria-hidden="true"
                  data-website-account-loading-spinner
                />
                <p className="text-sm text-muted-foreground">{locale === "en" ? "Loading sign-in…" : "正在加载登录界面…"}</p>
              </div>
            </div>
          </div>
        ) : null
      )}><WebsiteAccountDialog
          open={websiteAuthDialogOpen}
          onOpenChange={handleWebsiteAuthDialogOpenChange}
          onSessionChanged={handleWebsiteSessionChanged}
        /></Suspense> : null}

      {setupMounted ? <Suspense fallback={(
        <SetupDialogSkeleton open={setupOpen} onOpenChange={handleSetupOpenChange} />
      )}><SetupDialog
        {...(CLIENT_SKLAND_ENABLED ? {
          sklandSnapshot: sklandScheduleSnapshot,
          sklandBindingCount,
          sklandConfigured,
          sklandDisabledReason,
          onOpenSkland: openSklandFromSetup,
          onUseSklandSnapshot: useSklandSnapshotFromSetup,
        } : {})}
        open={setupOpen}
        onOpenChange={handleSetupOpenChange}
        operbox={operbox}
        boxSource={boxSource}
        fileName={fileName}
        inputMode={inputMode}
        onInputModeChange={setInputMode}
        maaPaste={maaPaste}
        onMaaPasteChange={setMaaPaste}
        inputError={inputError}
        resultClearWarningDismissed={resultClearWarningDismissed}
        onMaaFile={handleFile}
        onMaaPaste={handleMaaPaste}
        onManualBox={handleManualBox}
        onRequireWebsiteAccount={requireWebsiteAccountFromSetup}
        presets={PRESETS}
        preset={preset}
        layout={layout}
        configurationKey={setupConfigurationKey}
        rotationProfile={rotationProfile}
        onRotationProfileChange={handleRotationProfileChange}
        fiammettaEnabled={effectiveFiammettaEnabled}
        onFiammettaEnabledChange={handleFiammettaEnabledChange}
        onPresetSelect={handlePresetSelect}
        onLayoutFile={handleLayoutFile}
        onDownloadLayout={() => {
          void import("./download").then(({ downloadJson }) => downloadJson(`layout-${layout.template}.json`, layout));
        }}
        onRestoreResultClearWarning={restoreResultClearWarning}
        storageNotice={storageNotice}
        onClearLocalData={handleClearLocalData}
        onFactoryRecipeChange={handleFactoryRecipeChange}
        onTradeOrderChange={handleTradeOrderChange}
        onRoomLevelChange={handleRoomLevelChange}
        powerBudget={powerBudget}
        onFinish={closeSetup}
        onSkip={closeSetup}
      /></Suspense> : null}

      {issueModalMounted ? <Suspense fallback={null}><IssueNoteModal
        open={issueOpen}
        kind={issueDraftKind}
        row={issueDraftRow}
        note={issueDraftNote}
        saving={feedbackSaving}
        onNoteChange={setIssueDraftNote}
        onSave={handleSaveIssue}
        onCancel={handleCancelIssue}
      /></Suspense> : null}
      {productModalMounted ? <Suspense fallback={null}><ProductChangeConfirmModal
        open={Boolean(pendingProductChange)}
        roomLabel={rows.find((row) => row.roomId === pendingProductChange?.roomId)?.title ?? pendingProductChange?.roomId ?? "当前设施"}
        changeKind={pendingProductChange?.type === "trade" ? "贸易策略" : "制造配方"}
        nextValueLabel={pendingProductChange ? productChangeLabel(pendingProductChange) ?? "新配置" : "新配置"}
        busy={loading && Boolean(pendingProductChange)}
        onConfirm={() => void confirmScheduleProductChange()}
        onCancel={() => setPendingProductChange(null)}
      /></Suspense> : null}
      </SidebarInset>
    </SidebarProvider>
    </div>
      </TooltipProvider>
    </AppMotionProvider>
  );
}

function WorkbenchApp({ children }: { children: ReactNode }) {
  return <LanguageDemoProvider><WorkbenchAppContent>{children}</WorkbenchAppContent></LanguageDemoProvider>;
}

export default WorkbenchApp;
