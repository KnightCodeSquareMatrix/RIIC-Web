import type {
  ApiFailure,
  ApiResponse,
  AccountDataConsentData,
  AccountDataConsentRequest,
  AppErrorCode,
  BaseBlueprint,
  DisplayError,
  FeedbackData,
  FeedbackRequest,
  CloudWorkspaceData,
  CloudWorkspacePutRequest,
  OperBoxEntry,
  PublicHealthData,
  PublicPlanData,
  RotationProfile,
  SampleOperboxData,
  SavedPlanData,
  SavedPlanListData,
  SklandQrStartData,
  SklandQrStatusData,
  SklandSessionData,
  SklandStatusData,
} from "./types";
import type { SklandPolicyConsentRequest } from "./legal-policy";

const SKLAND_API_PREFIX = process.env.APP_CLIENT_SKLAND_API_PREFIX ?? "";

export class ApiClientError extends Error implements DisplayError {
  readonly code: AppErrorCode;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly fieldErrors?: ApiFailure["error"]["fieldErrors"];

  constructor(error: ApiFailure["error"]) {
    super(error.message);
    this.name = "ApiClientError";
    this.code = error.code;
    this.requestId = error.requestId;
    this.retryable = error.retryable;
    this.fieldErrors = error.fieldErrors;
  }
}

function networkError(): ApiClientError {
  return new ApiClientError({
    code: "AIC-SYS-5000",
    message: "无法连接服务，请检查网络后重试。",
    requestId: crypto.randomUUID(),
    retryable: true,
  });
}

async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError();
  }

  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (body?.success === true) return body.data;
  if (body?.success === false) throw new ApiClientError(body.error);
  throw new ApiClientError({
    code: "AIC-SYS-5000",
    message: "服务返回了无法识别的响应，请稍后重试。",
    requestId: response.headers.get("X-Request-Id") ?? crypto.randomUUID(),
    retryable: true,
  });
}

function sklandApiPath(path: string): string {
  if (SKLAND_API_PREFIX) return `${SKLAND_API_PREFIX}${path}`;
  throw new ApiClientError({
    code: "AIC-AUTH-2007",
    message: "当前站点不提供此功能。",
    requestId: crypto.randomUUID(),
    retryable: false,
  });
}

export function toDisplayError(error: unknown, fallback: string): DisplayError {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      retryable: error.retryable,
      fieldErrors: error.fieldErrors,
    };
  }
  return {
    code: "AIC-SYS-5000",
    message: fallback,
    retryable: true,
  };
}

type PlanRequestOptions = {
  signal?: AbortSignal;
};

export function computePlan(payload: {
  layout: BaseBlueprint;
  operbox: OperBoxEntry[];
  sourceName: string | null;
  boxSource: "skland" | "maa" | "sample";
  rotation: RotationProfile;
  fiammetta_enable?: boolean;
}, options: PlanRequestOptions = {}): Promise<PublicPlanData> {
  const requestPayload = payload.boxSource === "sample"
    ? { layout: payload.layout, sourceName: payload.sourceName, boxSource: payload.boxSource, rotation: payload.rotation, fiammetta_enable: payload.fiammetta_enable }
    : payload;
  return requestData("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
    signal: options.signal,
  });
}

export function getHealth(): Promise<PublicHealthData> {
  return requestData("/api/health");
}

export function getSklandAccounts(mode: "full" | "summary" = "full"): Promise<SklandSessionData> {
  return requestData(sklandApiPath(mode === "summary" ? "/accounts?mode=summary" : "/accounts"));
}

export function startSklandQr(consent: SklandPolicyConsentRequest): Promise<SklandQrStartData> {
  return requestData(sklandApiPath("/auth/qr"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consent }),
  });
}

export function refreshSklandStatus(): Promise<SklandStatusData> {
  return requestData(sklandApiPath("/status/refresh"), { method: "POST" });
}

export function pollSklandQr(scanId: string): Promise<SklandQrStatusData> {
  return requestData(sklandApiPath("/auth/qr/status"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanId }),
  });
}

export function syncSkland(): Promise<SklandSessionData> {
  return requestData(sklandApiPath("/sync"), { method: "POST" });
}

export function selectSklandRole(accountId: string, uid: string): Promise<SklandSessionData> {
  return requestData(sklandApiPath("/role"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, uid }),
  });
}

export function deleteSklandAccount(accountId: string): Promise<SklandSessionData> {
  return requestData(sklandApiPath(`/accounts/${encodeURIComponent(accountId)}`), { method: "DELETE" });
}

export function deleteAllSklandAccountData(): Promise<{ deleted: true; runs: number; feedback: number }> {
  return requestData(sklandApiPath("/account-data"), { method: "DELETE" });
}

export function getSampleOperbox(): Promise<SampleOperboxData> {
  return requestData("/api/sample-operbox");
}

export function saveFeedback(payload: FeedbackRequest): Promise<FeedbackData> {
  return requestData("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getAccountDataConsent(signal?: AbortSignal): Promise<AccountDataConsentData> {
  return requestData("/api/account/data-consent", { signal });
}

export function acceptAccountDataConsent(payload: AccountDataConsentRequest, signal?: AbortSignal): Promise<AccountDataConsentData> {
  return requestData("/api/account/data-consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

export function revokeAccountDataConsent(): Promise<{ revoked: true; deleted: true }> {
  return requestData("/api/account/data-consent", { method: "DELETE" });
}

export function getCloudWorkspace(signal?: AbortSignal): Promise<CloudWorkspaceData> {
  return requestData("/api/workspace", { signal });
}

export function putCloudWorkspace(payload: CloudWorkspacePutRequest, signal?: AbortSignal): Promise<CloudWorkspaceData> {
  return requestData("/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

export function getAccountSavedPlans(): Promise<SavedPlanListData> {
  return requestData("/api/account/saved-plans");
}

export function updateAccountSavedPlan(id: string, pinned: boolean): Promise<SavedPlanData> {
  return requestData(`/api/account/saved-plans/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
}

export function deleteAccountSavedPlan(id: string): Promise<{ deleted: true }> {
  return requestData(`/api/account/saved-plans/${encodeURIComponent(id)}`, { method: "DELETE" });
}
