import { handleUpdateAdminUser } from "@/server/admin-users-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]">) {
  const { id } = await context.params;
  return handleUpdateAdminUser(request, id);
}
