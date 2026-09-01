import termCatalogJson from "@/generated/arkntools/term-catalog.json" with { type: "json" };
import { createRequestId, successResponse } from "@/server/api-contract";

type TermRecord = { id: string; name: string; desc: string; descText: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return successResponse(
    termCatalogJson as Record<string, TermRecord>,
    createRequestId(),
  );
}
