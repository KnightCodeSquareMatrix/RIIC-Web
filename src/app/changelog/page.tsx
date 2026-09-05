import type { Metadata } from "next";
import { ChangelogPage } from "@/components/changelog/ChangelogPage";

export const metadata: Metadata = {
  title: "更新日志 - 可露希尔基建终端",
  description: "查看可露希尔基建终端的新功能、体验优化与问题修复。",
};

export default function Page() {
  return <ChangelogPage />;
}
