import { handleLegacyDeleteSklandData } from "@/server/skland/account-data-api";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  return handleLegacyDeleteSklandData(request);
}
