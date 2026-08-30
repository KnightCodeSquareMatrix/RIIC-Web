import { saveFeedback } from "@/server/infra";
import {
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  failureResponse,
  readJsonBody,
  requestClientIp,
  successResponse,
  validateFeedbackRequest,
} from "@/server/api-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    enforceRateLimit("feedback", requestClientIp(request), 5, 60 * 60_000);
    const body = await readJsonBody(request, 128 * 1024);
    validateFeedbackRequest(body);
    return successResponse(await saveFeedback(body), requestId);
  } catch (error) {
    return failureResponse(error, requestId, "/api/feedback", startedAt, "AIC-FEEDBACK-4002");
  }
}

