import { assertSameOrigin, createRequestId, failureResponse, successResponse } from "@/server/api-contract";
import { requireWebsiteSession } from "@/server/auth/authorization";
import { gachaCookieName, gachaSession, publicGachaRoles, revokeGachaSession } from "@/server/gacha-history";
import { assertSklandFeatureEnabled } from "@/server/skland/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandFeatureEnabled();
    const user = await requireWebsiteSession(request);
    const session = gachaSession(request, user.user.id);
    const response = successResponse({ roles: session ? publicGachaRoles(session) : [] }, requestId);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return failureResponse(error, requestId, "/api/gacha/session", startedAt, "AIC-SYS-5000", request); }
}

export async function DELETE(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandFeatureEnabled();
    assertSameOrigin(request);
    await requireWebsiteSession(request);
    revokeGachaSession(request);
    const response = successResponse({ disconnected: true }, requestId);
    response.cookies.set(gachaCookieName(), "", { httpOnly: true, sameSite: "lax", path: "/api/gacha", maxAge: 0 });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return failureResponse(error, requestId, "/api/gacha/session", startedAt, "AIC-SYS-5000", request); }
}
