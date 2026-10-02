import type { Metadata } from "next";
import { BillingPrototype } from "@/components/billing/BillingPrototype";
import { requireFeaturePage } from "@/server/auth/feature-page";
import { FeatureAccessBoundary } from "@/components/workbench/FeatureAccessProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "付费计划 · 可露希尔基建终端",
  description: "查看 Agent 积分余额、充值订单、工具扣费和用量统计。",
};

export default async function Page() {
  await requireFeaturePage("billing");
  return <FeatureAccessBoundary feature="billing"><BillingPrototype /></FeatureAccessBoundary>;
}
