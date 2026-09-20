import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { PlanArtifactView } from "@/components/agent/PlanArtifactView";
import { websiteSession } from "@/server/auth";
import { getAgentPlanArtifact } from "@/server/agent/plan-artifact";

export const metadata: Metadata = {
  title: "排班结果 · 可露希尔基建终端",
};

export const dynamic = "force-dynamic";

export default async function PlanArtifactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await websiteSession(await headers());
  if (!session?.user) notFound();
  const artifact = await getAgentPlanArtifact(id, session.user.id).catch(() => null);
  if (!artifact) notFound();
  const createdAt = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(artifact.createdAt);
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6" data-plan-artifact-page>
      <header className="mb-4 flex items-center gap-2.5">
        <span className="h-7 w-1.5 shrink-0 bg-[#FFD501]" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="truncate text-[21px] font-medium leading-none">可露希尔生成的排班方案</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {createdAt} 生成 · 布局 {artifact.meta.layoutPreset} · 干员 {artifact.meta.operatorCount} 名 · 保留 7 天
            {artifact.meta.factoryRecipes?.length ? ` · 制造站配方 ${artifact.meta.factoryRecipes.join(" / ")}` : ""}
          </p>
        </div>
      </header>
      <PlanArtifactView plan={artifact.plan} />
      <p className="mt-6 text-xs text-muted-foreground">
        <a className="underline underline-offset-4" href="/agent">← 返回可露希尔助理</a>
      </p>
    </section>
  );
}
