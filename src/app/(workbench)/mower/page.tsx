import { pageMetadata } from "@/i18n/metadata";
import { MowerSchedulePage } from "@/components/pages/MowerSchedulePage";

export default function Page() {
  return <MowerSchedulePage />;
}

export function generateMetadata() { return pageMetadata("mower"); }
