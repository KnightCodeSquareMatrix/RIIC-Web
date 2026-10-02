import { handleGetGameReport, handlePostGameReport } from "@/server/game-report-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) { return handleGetGameReport(request); }
export async function POST(request: Request) { return handlePostGameReport(request); }
