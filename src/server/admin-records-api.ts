import "server-only";

import {
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  failureResponse,
  PublicApiError,
  readJsonBody,
  requestClientIp,
  successResponse,
} from "./api-contract";
import { requireWebsiteAdmin } from "./auth/authorization";
import { isBusinessDatabaseReadEnabled } from "./business-config";
import { queryBusinessRecords, updateFeedbackRecord } from "./business-records";

type AdminRecordKind = "runs" | "feedback";
type AdminRecordRoute =
  | "/api/admin/records"
  | "/api/admin/plan-runs"
  | "/api/admin/feedback"
  | "/api/admin/feedback/[id]";

function date(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new PublicApiError("AIC-REQ-1001");
  return parsed;
}

function deprecated(response: Response, successor: string): Response {
  response.headers.set("Deprecation", "true");
  response.headers.set("Link", `<${successor}>; rel="successor-version"`);
  return response;
}

export async function handleListAdminRecords(
  request: Request,
  kind: AdminRecordKind,
  route: AdminRecordRoute,
) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    await requireWebsiteAdmin(request);
    if (!isBusinessDatabaseReadEnabled()) throw new PublicApiError("AIC-DATA-8002");
    const params = new URL(request.url).searchParams;
    return successResponse(await queryBusinessRecords({
      kind,
      limit: Number(params.get("limit") ?? 50),
      offset: Number(params.get("offset") ?? 0),
      from: date(params.get("from")),
      to: date(params.get("to")),
      status: params.get("status") ?? undefined,
      errorCode: params.get("errorCode") ?? undefined,
      solverExecutableSha256: params.get("solver") ?? undefined,
    }), requestId);
  } catch (error) {
    return failureResponse(error, requestId, route, startedAt);
  }
}

async function updateAdminFeedback(
  request: Request,
  feedbackId: string,
  body: { status?: unknown; note?: unknown } | null,
) {
  assertSameOrigin(request);
  enforceRateLimit("admin-record-update", requestClientIp(request), 60, 10 * 60_000);
  const admin = await requireWebsiteAdmin(request);
  if (!isBusinessDatabaseReadEnabled()) throw new PublicApiError("AIC-DATA-8002");
  if (
    !feedbackId
    || feedbackId.length > 100
    || !["pending", "working", "resolved"].includes(String(body?.status))
    || typeof body?.note !== "string"
    || body.note.length > 2000
  ) throw new PublicApiError("AIC-REQ-1001");
  const updated = await updateFeedbackRecord({
    feedbackId,
    status: body.status as "pending" | "working" | "resolved",
    note: body.note,
    actorUserId: admin.session.user.id,
  });
  if (!updated) throw new PublicApiError("AIC-DATA-8004");
  return updated;
}

export async function handleUpdateAdminFeedback(
  request: Request,
  feedbackId: string,
  route: AdminRecordRoute = "/api/admin/feedback/[id]",
) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request, 16 * 1024) as { status?: unknown; note?: unknown } | null;
    return successResponse(await updateAdminFeedback(request, feedbackId, body), requestId);
  } catch (error) {
    return failureResponse(error, requestId, route, startedAt);
  }
}

export async function handleLegacyAdminRecordsGet(request: Request) {
  const kindValue = new URL(request.url).searchParams.get("kind");
  const kind = kindValue === "feedback" ? "feedback" : kindValue === "runs" ? "runs" : null;
  if (!kind) {
    const requestId = createRequestId();
    return deprecated(
      failureResponse(new PublicApiError("AIC-REQ-1001"), requestId, "/api/admin/records", performance.now()),
      "/api/admin/plan-runs",
    );
  }
  const successor = kind === "runs" ? "/api/admin/plan-runs" : "/api/admin/feedback";
  return deprecated(await handleListAdminRecords(request, kind, "/api/admin/records"), successor);
}

export async function handleLegacyAdminRecordsPatch(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  let successor = "/api/admin/feedback";
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request, 16 * 1024) as {
      feedbackId?: unknown;
      status?: unknown;
      note?: unknown;
    } | null;
    const feedbackId = typeof body?.feedbackId === "string" ? body.feedbackId : "";
    successor = `/api/admin/feedback/${encodeURIComponent(feedbackId)}`;
    return deprecated(successResponse(
      await updateAdminFeedback(request, feedbackId, body),
      requestId,
    ), successor);
  } catch (error) {
    return deprecated(failureResponse(error, requestId, "/api/admin/records", startedAt), successor);
  }
}
