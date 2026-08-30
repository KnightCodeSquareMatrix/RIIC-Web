import { handleRefreshSklandStatus } from "@/server/skland/status-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRefreshSklandStatus(request, "/api/skland/status/refresh");
}
