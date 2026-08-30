import { handleDeleteSklandAccountData } from "@/server/skland/account-data-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  return handleDeleteSklandAccountData(request, "/api/skland/account-data");
}
