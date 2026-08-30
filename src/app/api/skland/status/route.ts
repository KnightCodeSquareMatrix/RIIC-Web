import { handleLegacyGetSklandStatus } from "@/server/skland/status-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleLegacyGetSklandStatus(request);
}
