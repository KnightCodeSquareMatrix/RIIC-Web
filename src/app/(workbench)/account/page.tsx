import { pageMetadata } from "@/i18n/metadata";
import { AccountRoute } from "@/components/workbench/AccountRoute";

export default function Page() {
  return <AccountRoute />;
}

export function generateMetadata() { return pageMetadata("account"); }
