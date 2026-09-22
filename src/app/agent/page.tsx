import type { Metadata } from "next";

import { AgentChat } from "@/components/agent/AgentChat";

export const metadata: Metadata = {
  title: "可露希尔助理 · 可露希尔基建终端",
  description: "实验性 agent 入口：串联账号诊断、排班求解、技能查询与知识库。",
};

export default function Page() {
  return <AgentChat />;
}
