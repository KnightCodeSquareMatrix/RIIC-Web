import { pageMetadata } from "@/i18n/metadata";
import { RecruitmentRoute } from "@/components/workbench/RecruitmentRoute";

export default function Page() { return <RecruitmentRoute />; }

export function generateMetadata() { return pageMetadata("recruitment"); }
