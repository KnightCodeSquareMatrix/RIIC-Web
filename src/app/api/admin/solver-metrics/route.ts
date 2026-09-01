import { handleGetAdminSolverMetrics } from "@/server/admin-solver-metrics-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleGetAdminSolverMetrics(request);
}
