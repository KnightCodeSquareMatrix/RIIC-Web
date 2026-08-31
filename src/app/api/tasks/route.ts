import {
  admitPlanStart,
  assertFiammettaEnableCompatible,
  assertPlanCollectionLimits,
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  failureResponse,
  normalizeFiammettaEnable,
  PublicApiError,
  readJsonBody,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import { requireWebsiteSession } from "@/server/auth/authorization";
import { validateLayoutJson } from "@/layout-validation";
import { assertOperbox } from "@/operbox";
import { createPlanTask, userHasActivePlanTask, PLAN_TASK_ETA_PER_TASK_SECONDS } from "@/server/plan-task";
import { ensurePlanTaskWorkerStarted } from "@/server/plan-task-worker";
import { safeDisplayName } from "@/server/public-plan";
import { isRotationProfile } from "@/rotation-settings";
import { isAccountCloudSyncEnabled, workspaceMasterKeys } from "@/server/business-config";
import { accountDataConsent } from "@/server/data-consent";
import { activeSklandAccount, readSklandAccountStore } from "@/server/skland/http";
import { sklandDataOwnerTag } from "@/server/skland/session";
import { planOperboxContentHmac } from "@/server/workspace-crypto";
import type { BaseBlueprint, OperBoxEntry, RotationProfile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmitBody = {
  layout?: BaseBlueprint;
  operbox?: OperBoxEntry[];
  sourceName?: unknown;
  rotation?: unknown;
  boxSource?: unknown;
  fiammetta_enable?: unknown;
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && (error as { code?: unknown }).code === "23505";
}

function filterOwnedOperbox(entries: OperBoxEntry[]): OperBoxEntry[] {
  const seenNames = new Set<string>();
  const skipNames = new Set(["阿米娅（近卫）", "阿米娅（医疗）"]);
  return entries.filter((entry) => {
    if (!entry.own) return false;
    const name = entry.name.trim();
    if (skipNames.has(name) || seenNames.has(name)) return false;
    seenNames.add(name);
    return true;
  });
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    const ip = requestClientIp(request);
    enforceRateLimit("plan-submit", ip, 20, 10 * 60_000, "AIC-PLAN-3002");

    const body = await readJsonBody(request, 2 * 1024 * 1024) as SubmitBody | null;
    if (!body) throw new PublicApiError("AIC-REQ-1001");
    if (body.boxSource !== "sample" && body.boxSource !== "maa" && body.boxSource !== "skland") {
      throw new PublicApiError("AIC-REQ-1001", {
        fieldErrors: [{ path: "boxSource", code: "invalid_source", message: "排班数据来源无效。" }],
      });
    }
    if (body.boxSource === "sample") {
      throw new PublicApiError("AIC-REQ-1001", {
        fieldErrors: [{ path: "boxSource", code: "unsupported_source", message: "示例排班请使用即时计算接口。" }],
      });
    }
    const session = await requireWebsiteSession(request);
    const userId = session.user.id;

    const layoutErrors = validateLayoutJson(body.layout);
    if (layoutErrors.length || !body.layout) {
      throw new PublicApiError("AIC-LAYOUT-1201", {
        fieldErrors: (layoutErrors.length ? layoutErrors : ["布局格式无效。"]).map((message) => ({
          path: "layout",
          code: "invalid_layout",
          message,
        })),
      });
    }
    if (!Array.isArray(body.operbox)) {
      throw new PublicApiError("AIC-BOX-1101", {
        fieldErrors: [{ path: "operbox", code: "invalid_operbox", message: "干员数据需要是数组。" }],
      });
    }
    let rotation: RotationProfile = "abc_12_6_6";
    if (body.rotation !== undefined) {
      if (!isRotationProfile(body.rotation)) {
        throw new PublicApiError("AIC-PLAN-3001", {
          fieldErrors: [{
            path: "rotation",
            code: "invalid_rotation",
            message: "换班参数不在当前求解器支持范围内。",
          }],
        });
      }
      rotation = body.rotation;
    }
    const fiammettaEnable = normalizeFiammettaEnable(body.fiammetta_enable);
    assertFiammettaEnableCompatible(fiammettaEnable, rotation);
    assertPlanCollectionLimits(body.operbox.length, body.layout.rooms.length, body.sourceName);
    let operbox: OperBoxEntry[];
    try {
      operbox = assertOperbox(body.operbox);
    } catch (error) {
      throw new PublicApiError("AIC-BOX-1101", {
        fieldErrors: [{
          path: "operbox",
          code: "invalid_operbox_entry",
          message: error instanceof Error ? error.message : "干员数据包含无效记录。",
        }],
        cause: error,
      });
    }
    const sourceName = safeDisplayName(body.sourceName, "已导入的干员数据");
    const sourceType = body.boxSource === "skland" ? "skland" : "maa";
    let dataOwnerTag: string | null = null;
    if (body.boxSource === "skland") {
      const account = activeSklandAccount(await readSklandAccountStore());
      if (account) dataOwnerTag = sklandDataOwnerTag(account.session.userId);
    }

    // 并发限制：登录用户同一时间最多一条 pending/running（数据库唯一索引兜底）。
    if (await userHasActivePlanTask(userId)) {
      throw new PublicApiError("AIC-PLAN-3005");
    }

    const ownedOperbox = filterOwnedOperbox(operbox);
    if (ownedOperbox.length === 0) {
      throw new PublicApiError("AIC-BOX-1101", {
        fieldErrors: [{
          path: "operbox",
          code: "invalid_operbox",
          message: "干员数据中没有已拥有的干员，无法生成排班。",
        }],
      });
    }

    let operboxContentHmac: string | null = null;
    let operboxHmacKeyVersion: string | null = null;
    if (sourceType === "maa" && isAccountCloudSyncEnabled() && (await accountDataConsent(userId)).current) {
      const { activeVersion, keys } = workspaceMasterKeys();
      const activeKey = keys.get(activeVersion);
      if (!activeKey) throw new Error("Active workspace key is unavailable.");
      operboxContentHmac = planOperboxContentHmac({ userId, operbox: ownedOperbox, masterKey: activeKey });
      operboxHmacKeyVersion = activeVersion;
    }

    admitPlanStart({ ip, accountId: userId });
    let task;
    try {
      task = await createPlanTask({
        userId,
        payload: {
          layout: body.layout,
          operbox: ownedOperbox,
          sourceName,
          sourceType,
          rotation,
          fiammettaEnable,
          layoutTemplate: body.layout.template,
          roomCount: body.layout.rooms.length,
          operatorCount: ownedOperbox.length,
          dataOwnerTag,
          operboxContentHmac,
          operboxHmacKeyVersion,
        },
      });
    } catch (error) {
      // 预检查和插入之间存在竞态窗口时，唯一索引兜底会抛 23505，转成友好提示。
      if (isUniqueViolation(error)) {
        throw new PublicApiError("AIC-PLAN-3005");
      }
      throw error;
    }
    ensurePlanTaskWorkerStarted();

    return successResponse({
      taskId: task.id,
      status: "pending",
      queuePosition: 1,
      etaSeconds: PLAN_TASK_ETA_PER_TASK_SECONDS,
    }, requestId);
  } catch (error) {
    return failureResponse(error, requestId, "/api/tasks", startedAt);
  }
}
