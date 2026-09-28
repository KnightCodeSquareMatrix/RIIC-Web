import { pageMetadata } from "@/i18n/metadata";
import { AccountHealthRoute } from "@/components/workbench/AccountHealthRoute";

export default function Page() {
  return <AccountHealthRoute />;
}

export function generateMetadata() { return pageMetadata("account_health"); }
