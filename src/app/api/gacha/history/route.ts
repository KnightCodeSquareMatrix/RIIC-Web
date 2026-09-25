import { assertSameOrigin, createRequestId, enforceRateLimit, failureResponse, PublicApiError, requestClientIp, successResponse } from "@/server/api-contract";
import { requireWebsiteSession } from "@/server/auth/authorization";
import { fetchGachaHistory, gachaSession, publicGachaError } from "@/server/gacha-history";
import { assertSklandFeatureEnabled } from "@/server/skland/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandFeatureEnabled();
    assertSameOrigin(request);
    const user = await requireWebsiteSession(request);
    enforceRateLimit("gacha-history", `${user.user.id}:${requestClientIp(request)}`, 10, 60 * 60_000);
    const session = gachaSession(request, user.user.id);
    if (!session) throw new PublicApiError("AIC-AUTH-2008", { message: "请扫码授权读取寻访记录。" });
    const uid = new URL(request.url).searchParams.get("uid") ?? "";
    const response = successResponse(await fetchGachaHistory(session, uid), requestId);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return failureResponse(publicGachaError(error), requestId, "/api/gacha/history", startedAt, "AIC-SYS-5000", request);
  }
}
