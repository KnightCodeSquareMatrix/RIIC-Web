import { handleListAdminRecords } from "@/server/admin-records-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleListAdminRecords(request, "runs", "/api/admin/plan-runs");
}
