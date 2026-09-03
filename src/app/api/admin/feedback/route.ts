import { handleDeleteAdminFeedback, handleListAdminRecords } from "@/server/admin-records-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleListAdminRecords(request, "feedback", "/api/admin/feedback");
}

export async function DELETE(request: Request) {
  return handleDeleteAdminFeedback(request);
}
