import { handleDeleteSklandAccount } from "@/server/skland/accounts-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: RouteContext<"/api/skland/accounts/[id]">) {
  const { id } = await context.params;
  return handleDeleteSklandAccount(request, id, "/api/skland/accounts/[id]");
}
