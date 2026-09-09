import { JobComparisonRoute } from "@/components/workbench/JobComparisonRoute";
import { pageMetadata } from "@/i18n/metadata";

export default function Page() { return <JobComparisonRoute />; }
export function generateMetadata() { return pageMetadata("comparison"); }
