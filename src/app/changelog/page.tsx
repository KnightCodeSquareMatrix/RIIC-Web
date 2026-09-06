import { ChangelogPage } from "@/components/changelog/ChangelogPage";
import { pageMetadata } from "@/i18n/metadata";

export default function Page() {
  return <ChangelogPage />;
}

export function generateMetadata() { return pageMetadata("changelog"); }
