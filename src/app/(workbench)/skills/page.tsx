import { pageMetadata } from "@/i18n/metadata";
import { SkillQuery } from "@/components/pages/SkillQuery";

export default function Page() {
  return <SkillQuery />;
}

export function generateMetadata() { return pageMetadata("skills"); }
