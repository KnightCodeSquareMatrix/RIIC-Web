import { pageMetadata } from "@/i18n/metadata";
import { SkillAnnotationManager } from "./skill-annotations-client";

export const dynamic = "force-dynamic";

export default function AdminSkillAnnotationsPage() {
  return <SkillAnnotationManager />;
}

export function generateMetadata() { return pageMetadata("admin_skills"); }
