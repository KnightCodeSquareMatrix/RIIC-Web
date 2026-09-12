import { pageMetadata } from "@/i18n/metadata";
import { MowerScheduleRoute } from "@/components/workbench/MowerScheduleRoute";

export default function Page() {
  return <MowerScheduleRoute />;
}

export function generateMetadata() { return pageMetadata("mower"); }
