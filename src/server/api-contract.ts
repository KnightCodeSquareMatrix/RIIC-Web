import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server.js";

import {
  areRequestRateLimitsEnabled,
  isDebugToolsFeatureEnabled,
} from "../deployment.ts";
import type {
  ApiFailure,
  ApiFieldError,
  ApiSuccess,
  AppErrorCode,
  FeedbackRequest,
} from "../types";

type ErrorDefinition = {
  status: number;
  message: string;
  retryable: boolean;
};

export const ERROR_DEFINITIONS: Record<AppErrorCode, ErrorDefinition> = {
  "AIC-AUTH-2008": { status: 401, message: "请先登录网站账号后再使用此功能。", retryable: false },
  "AIC-AUTH-2009": { status: 403, message: "当前账号没有管理员权限。", retryable: false },
  "AIC-REQ-1001": { status: 400, message: "请求格式无法识别，请检查后重试。", retryable: false },
  "AIC-REQ-1002": { status: 413, message: "提交的数据过大，请精简后重试。", retryable: false },
  "AIC-BOX-1101": { status: 422, message: "干员数据无效，请重新导入。", retryable: false },
  "AIC-LAYOUT-1201": { status: 422, message: "基建设施配置无效，请检查布局。", retryable: false },
  "AIC-AUTH-2001": { status: 401, message: "森空岛登录已过期，请重新登录。", retryable: false },
  "AIC-AUTH-2002": { status: 403, message: "请求来源无效，请刷新页面后重试。", retryable: false },
  "AIC-AUTH-2003": { status: 503, message: "当前未开放森空岛登录，可使用 MAA 导入。", retryable: true },
  "AIC-AUTH-2004": { status: 409, message: "同一浏览器最多可登录 5 个森空岛账号，请先退出一个账号。", retryable: false },
  "AIC-AUTH-2005": { status: 400, message: "请先阅读并同意本站服务条款和隐私政策。", retryable: false },
  "AIC-AUTH-2006": { status: 409, message: "这个森空岛账号已经绑定到其他网站账号。", retryable: false },
  "AIC-AUTH-2007": { status: 404, message: "当前站点不提供此功能。", retryable: false },
  "AIC-PLAN-3001": { status: 503, message: "排班服务暂不可用，请稍后重试。", retryable: true },
  "AIC-PLAN-3002": { status: 429, message: "已有排班任务或请求过于频繁，请稍后重试。", retryable: true },
  "AIC-PLAN-3003": { status: 504, message: "排班计算超时，请稍后重试。", retryable: true },
  "AIC-PLAN-3004": { status: 502, message: "排班结果暂时无法解析，请稍后重试。", retryable: true },
  "AIC-FEEDBACK-4001": { status: 422, message: "反馈内容无效，请检查后重试。", retryable: false },
  "AIC-FEEDBACK-4002": { status: 500, message: "反馈保存失败，请稍后重试。", retryable: true },
  "AIC-SYS-5000": { status: 500, message: "服务暂时出现问题，请稍后重试。", retryable: true },
  "AIC-RATE-6001": { status: 429, message: "操作过于频繁，请稍后重试。", retryable: true },
  "AIC-LOCAL-7001": { status: 0, message: "浏览器无法保存本地数据，但仍可继续生成排班。", retryable: false },
  "AIC-DATA-8001": { status: 403, message: "请先确认当前版本的服务条款与隐私政策。", retryable: false },
  "AIC-DATA-8002": { status: 503, message: "账号云端数据暂不可用，请继续使用本地模式。", retryable: true },
  "AIC-DATA-8003": { status: 422, message: "云端工作区数据无效，请检查后重试。", retryable: false },
  "AIC-DATA-8004": { status: 404, message: "请求的云端数据不存在或已过期。", retryable: false },
};

export class PublicApiError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly fieldErrors?: ApiFieldError[];
  readonly retryAfter?: number;

  constructor(
    code: AppErrorCode,
    options: {
      message?: string;
      fieldErrors?: ApiFieldError[];
      retryAfter?: number;
      cause?: unknown;
    } = {}
  ) {
    const definition = ERROR_DEFINITIONS[code];
    super(options.message ?? definition.message, { cause: options.cause });
    this.name = "PublicApiError";
    this.code = code;
    this.status = definition.status;
    this.retryable = definition.retryable;
    this.fieldErrors = options.fieldErrors;
    this.retryAfter = options.retryAfter;
  }
}

export function createRequestId(): string {
  return randomUUID();
}

export function isDebugToolsEnabled(): boolean {
  return isDebugToolsFeatureEnabled();
}

export function areRateLimitsEnabled(): boolean {
  return areRequestRateLimitsEnabled();
}

export function healthHttpStatus(plannerReady: boolean): 200 | 503 {
  return plannerReady ? 200 : 503;
}

export function successResponse<T>(data: T, requestId: string, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    { success: true, data, requestId },
    { status, headers: { "X-Request-Id": requestId } }
  );
}

function normalizePublicError(error: unknown, fallback: AppErrorCode): PublicApiError {
  if (error instanceof PublicApiError) return error;
  return new PublicApiError(fallback, { cause: error });
}

export function failureResponse(
  error: unknown,
  requestId: string,
  route: string,
  startedAt: number,
  fallback: AppErrorCode = "AIC-SYS-5000"
): NextResponse<ApiFailure> {
  const known = normalizePublicError(error, fallback);
  const headers: Record<string, string> = { "X-Request-Id": requestId };
  if (known.retryAfter) headers["Retry-After"] = String(known.retryAfter);

  console.error(JSON.stringify({
    level: "error",
    requestId,
    code: known.code,
    route,
    status: known.status,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
  }));

  return NextResponse.json(
    {
      success: false,
      error: {
        code: known.code,
        message: known.message,
        requestId,
        retryable: known.retryable,
        ...(known.fieldErrors?.length ? { fieldErrors: known.fieldErrors } : {}),
      },
    },
    { status: known.status, headers }
  );
}

async function readRequestBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new PublicApiError("AIC-REQ-1002");
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new PublicApiError("AIC-REQ-1002");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function assertEmptyBody(request: Request, maxBytes: number): Promise<void> {
  if ((await readRequestBody(request, maxBytes)).byteLength > 0) {
    throw new PublicApiError("AIC-REQ-1001");
  }
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readRequestBody(request, maxBytes);
  if (bytes.byteLength === 0) throw new PublicApiError("AIC-REQ-1001");

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new PublicApiError("AIC-REQ-1001", { cause: error });
  }
}

function trustedRequestOrigin(request: Request): string {
  const configured = process.env.BETA_PUBLIC_ORIGIN?.trim();
  if (configured) return new URL(configured).origin;

  const requestUrl = new URL(request.url);
  if (process.env.BETA_TRUST_PROXY_HEADERS === "1") {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (proto && host) return `${proto}://${host}`;
  }
  const host = request.headers.get("host")?.trim();
  if (host) return new URL(`${requestUrl.protocol}//${host}`).origin;
  return requestUrl.origin;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  try {
    if (new URL(origin).origin !== trustedRequestOrigin(request)) {
      throw new PublicApiError("AIC-AUTH-2002");
    }
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError("AIC-AUTH-2002", { cause: error });
  }
}

export function requestClientIp(request: Request): string {
  if (process.env.BETA_TRUST_PROXY_HEADERS !== "1") return "direct";
  return (
    request.headers.get("cf-connecting-ip")?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown"
  );
}

type RateEntry = { count: number; resetAt: number };
type GuardState = {
  rates: Map<string, RateEntry>;
  planIps: Set<string>;
  planGlobal: number;
};

const guardGlobal = globalThis as typeof globalThis & { __aicRequestGuard?: GuardState };
const guardState = guardGlobal.__aicRequestGuard ??= {
  rates: new Map(),
  planIps: new Set(),
  planGlobal: 0,
};
const MAX_RATE_KEYS = 10_000;

function pruneRates(now: number): void {
  for (const [key, entry] of guardState.rates) {
    if (entry.resetAt <= now) guardState.rates.delete(key);
  }
  while (guardState.rates.size >= MAX_RATE_KEYS) {
    const oldest = guardState.rates.keys().next().value as string | undefined;
    if (!oldest) break;
    guardState.rates.delete(oldest);
  }
}

export function enforceRateLimit(
  bucket: string,
  ip: string,
  limit: number,
  windowMs: number,
  code: AppErrorCode = "AIC-RATE-6001"
): void {
  if (!areRateLimitsEnabled()) return;
  const now = Date.now();
  pruneRates(now);
  const key = `${bucket}:${ip}`;
  const current = guardState.rates.get(key);
  if (!current || current.resetAt <= now) {
    guardState.rates.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    throw new PublicApiError(code, {
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    });
  }
  current.count += 1;
}

export function acquirePlanSlot(ip: string): () => void {
  if (guardState.planIps.has(ip) || guardState.planGlobal >= 8) {
    throw new PublicApiError("AIC-PLAN-3002", { retryAfter: 5 });
  }
  guardState.planIps.add(ip);
  guardState.planGlobal += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    guardState.planIps.delete(ip);
    guardState.planGlobal = Math.max(0, guardState.planGlobal - 1);
  };
}

export function validateFeedbackRequest(value: unknown): asserts value is FeedbackRequest {
  const body = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const room = body?.room && typeof body.room === "object" && !Array.isArray(body.room)
    ? body.room as Record<string, unknown>
    : null;
  const kind = body?.kind === undefined ? "room_issue" : body.kind;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const commonValid =
    Boolean(body)
    && typeof body?.diagnosticId === "string"
    && body.diagnosticId.length >= 1
    && body.diagnosticId.length <= 80
    && note.length >= 1
    && note.length <= 1000
    && body?.consent === true;
  const roomValid = kind === "room_issue"
    && Boolean(room)
    && typeof room?.id === "string"
    && room.id.length >= 1
    && room.id.length <= 80
    && typeof room?.title === "string"
    && room.title.length >= 1
    && room.title.length <= 120
    && typeof room?.group === "string"
    && room.group.length >= 1
    && room.group.length <= 80
    && Array.isArray(room?.operators)
    && room.operators.length <= 10
    && room.operators.every((operator) => typeof operator === "string" && operator.length <= 80);
  const performanceValid = kind === "performance_issue" && body?.room === undefined;

  if (!commonValid || (!roomValid && !performanceValid)) {
    throw new PublicApiError("AIC-FEEDBACK-4001", {
      fieldErrors: [{
        path: "body",
        code: "invalid_feedback",
        message: "请填写 1–1000 字说明，选择有效的反馈类型，并确认提交本次排班问题。",
      }],
    });
  }
}

export function assertPlanCollectionLimits(
  operboxCount: number,
  roomCount: number,
  sourceName: unknown
): void {
  if (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > 64) {
    throw new PublicApiError("AIC-LAYOUT-1201", {
      fieldErrors: [{
        path: "layout.rooms",
        code: "invalid_room_count",
        message: "布局需包含 1–64 个房间。",
      }],
    });
  }
  if (!Number.isInteger(operboxCount) || operboxCount < 1 || operboxCount > 1000) {
    throw new PublicApiError("AIC-BOX-1101", {
      fieldErrors: [{
        path: "operbox",
        code: "invalid_operbox",
        message: "干员数据需包含 1–1000 条记录。",
      }],
    });
  }
  if (sourceName != null && (typeof sourceName !== "string" || sourceName.length > 80)) {
    throw new PublicApiError("AIC-BOX-1101", {
      fieldErrors: [{
        path: "sourceName",
        code: "invalid_source_name",
        message: "数据来源名称最多 80 个字符。",
      }],
    });
  }
}

export function normalizeFiammettaEnable(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "boolean") {
    throw new PublicApiError("AIC-REQ-1001", {
      fieldErrors: [{
        path: "fiammetta_enable",
        code: "invalid_fiammetta_enable",
        message: "fiammetta_enable 必须是布尔值。",
      }],
    });
  }
  return value;
}

export function assertFiammettaEnableCompatible(fiammettaEnable: boolean, rotation: string): void {
  if (!fiammettaEnable && rotation === "fiammetta_8_8_4_4") {
    throw new PublicApiError("AIC-REQ-1001", {
      fieldErrors: [{
        path: "fiammetta_enable",
        code: "fiammetta_enable_conflicts_with_rotation",
        message: "未启用菲亚梅塔时不能使用菲亚梅塔轮换。",
      }],
    });
  }
}

export function __resetRequestGuardsForTests(): void {
  guardState.rates.clear();
  guardState.planIps.clear();
  guardState.planGlobal = 0;
}
