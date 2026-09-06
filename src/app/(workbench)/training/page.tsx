import { pageMetadata } from "@/i18n/metadata";
import { TrainingRoute } from "@/components/workbench/TrainingRoute";

export default function Page() {
  return <TrainingRoute />;
}

export function generateMetadata() { return pageMetadata("training"); }
