import { pageMetadata } from "@/i18n/metadata";
import { SettingsRoute } from "@/components/workbench/SettingsRoute";

export default function Page() {
  return <SettingsRoute />;
}

export function generateMetadata() { return pageMetadata("settings"); }
