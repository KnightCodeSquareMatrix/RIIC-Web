import {
  handleLegacyDeleteSklandSession,
  handleLegacyGetSklandSession,
} from "@/server/skland/accounts-api";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleLegacyGetSklandSession(request);
}

export async function DELETE(request: Request) {
  return handleLegacyDeleteSklandSession(request);
}
