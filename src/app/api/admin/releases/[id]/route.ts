import { handleAdminReleaseMutation } from "@/server/release-notes-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/releases/[id]">) {
  return handleAdminReleaseMutation(request, (await context.params).id);
}
