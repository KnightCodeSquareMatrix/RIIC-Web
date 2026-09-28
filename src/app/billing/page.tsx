import type { Metadata } from "next";
import { BillingPrototype } from "@/components/billing/BillingPrototype";

export const metadata: Metadata = {
  title: "Agent 积分与用量 · 可露希尔基建终端",
  description: "查看 Agent 积分余额、充值订单、工具扣费和用量统计。",
};

export default function Page() {
  return <BillingPrototype />;
}
