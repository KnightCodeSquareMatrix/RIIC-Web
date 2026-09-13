import { pageMetadata } from "@/i18n/metadata";
import { ManualScheduleRoute } from "@/components/workbench/ManualScheduleRoute";

export default function Page() {
  return <ManualScheduleRoute />;
}

export function generateMetadata() { return pageMetadata("manual"); }
