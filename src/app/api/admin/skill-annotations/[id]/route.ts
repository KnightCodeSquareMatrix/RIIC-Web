import {
  handleDeleteAdminSkillAnnotation,
  handleUpdateAdminSkillAnnotation,
} from "@/server/skill-annotations-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/skill-annotations/[id]">,
) {
  const { id } = await context.params;
  return handleUpdateAdminSkillAnnotation(request, id);
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/admin/skill-annotations/[id]">,
) {
  const { id } = await context.params;
  return handleDeleteAdminSkillAnnotation(request, id);
}
