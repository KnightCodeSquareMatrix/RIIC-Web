import { assertSameOrigin, createRequestId, enforceRateLimit, failureResponse, PublicApiError, readJsonBody, successResponse } from "@/server/api-contract";
import { requireWebsiteAdmin } from "@/server/auth/authorization";
import { issueAdminCdks, listAdminCdks } from "@/server/billing/admin-cdk";
import { CdkValidationError } from "@/server/billing/cdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  let response: Response;
  try {
    const { session } = await requireWebsiteAdmin(request);
    if (request.method === "GET") {
      response = successResponse({ codes: await listAdminCdks() }, requestId);
    } else {
      assertSameOrigin(request);
      enforceRateLimit("admin-cdk-issue", session.user.id, 20, 60_000);
      response = successResponse(await issueAdminCdks(session.user.id, await readJsonBody(request, 16 * 1024)), requestId, 201);
    }
  } catch (error) {
    response = failureResponse(error instanceof CdkValidationError
      ? new PublicApiError("AIC-REQ-1001", { message: error.message }) : error,
    requestId, "/api/admin/billing/cdk", startedAt, "AIC-SYS-5000", request);
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const GET = handle;
export const POST = handle;
