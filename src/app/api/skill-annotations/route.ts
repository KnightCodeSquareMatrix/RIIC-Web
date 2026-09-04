import { handleListSkillAnnotations } from "@/server/skill-annotations-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleListSkillAnnotations(request);
}
