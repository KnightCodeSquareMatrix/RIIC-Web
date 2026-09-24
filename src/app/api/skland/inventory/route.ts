import { handleGetSklandInventory } from "@/server/skland/inventory-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleGetSklandInventory(request, "/api/skland/inventory");
}
