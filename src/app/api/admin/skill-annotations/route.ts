import {
  handleCreateAdminSkillAnnotation,
  handleListAdminSkillAnnotations,
} from "@/server/skill-annotations-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleListAdminSkillAnnotations(request);
}

export async function POST(request: Request) {
  return handleCreateAdminSkillAnnotation(request);
}
