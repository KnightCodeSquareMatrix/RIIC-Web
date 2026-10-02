import type { Metadata } from "next";

import { AgentRoute } from "@/components/workbench/AgentRoute";
import { requireFeaturePage } from "@/server/auth/feature-page";
import { FeatureAccessBoundary } from "@/components/workbench/FeatureAccessProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "可露希尔助理 · 可露希尔基建终端",
  description: "实验性 agent 入口：串联账号诊断、排班求解、技能查询与知识库。",
};

export default async function Page() {
  await requireFeaturePage("agent");
  return <FeatureAccessBoundary feature="agent"><AgentRoute /></FeatureAccessBoundary>;
}
