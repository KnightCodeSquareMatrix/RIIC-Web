import {
  handleDeleteAdminUserSessions,
  handleListAdminUserSessions,
} from "@/server/admin-users-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/admin/users/[id]/sessions">) {
  const { id } = await context.params;
  return handleListAdminUserSessions(request, id);
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/users/[id]/sessions">) {
  const { id } = await context.params;
  return handleDeleteAdminUserSessions(request, id);
}
