import { handleListSavedPlans } from "@/server/saved-plans-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleListSavedPlans(request, "/api/account/saved-plans");
}
