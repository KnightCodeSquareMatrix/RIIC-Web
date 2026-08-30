import { handleUpdateAdminFeedback } from "@/server/admin-records-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/feedback/[id]">) {
  const { id } = await context.params;
  return handleUpdateAdminFeedback(request, id);
}
