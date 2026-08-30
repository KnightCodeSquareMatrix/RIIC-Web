"use client";

import { AccountStatusCenter } from "@/components/pages/AccountStatusCenter";
import { useWorkbench } from "@/workbench-context";

export function AccountRoute() {
  const { account } = useWorkbench();
  return <AccountStatusCenter {...account} />;
}
