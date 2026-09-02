import { handleGetAdminPlanRunDetail } from "@/server/admin-records-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/admin/plan-runs/[id]">) {
  const { id } = await context.params;
  return handleGetAdminPlanRunDetail(request, id);
}
