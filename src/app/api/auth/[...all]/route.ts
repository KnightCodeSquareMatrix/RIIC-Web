import { getAuth, websiteSession } from "@/server/auth";
import { isForbiddenNativeAdminPath } from "@/server/auth/native-route-policy";
import { responseWithClearedSklandCookies } from "@/server/auth/session-cookie-cleanup";
import { evictPlanCacheKeys, userPlanCacheKeys } from "@/server/plan-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (isForbiddenNativeAdminPath(request.url)) {
    return Response.json({ code: "NOT_FOUND", message: "Not found" }, { status: 404 });
  }
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  if (pathname === "/api/auth/delete-user") {
    const current = await websiteSession(request);
    if (current?.user.id) await evictPlanCacheKeys(await userPlanCacheKeys(current.user.id));
  }
  const response = await getAuth().handler(request);
  if (response.ok && ["/api/auth/sign-out", "/api/auth/delete-user", "/api/auth/revoke-sessions"].includes(pathname)) {
    return responseWithClearedSklandCookies(response, request);
  }
  return response;
}

export const GET = handle;
export const POST = handle;
