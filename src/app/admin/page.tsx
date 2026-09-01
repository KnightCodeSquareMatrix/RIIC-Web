import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireWebsiteAdmin } from "@/server/auth/authorization";
import { getHealth } from "@/server/infra";
import { AdminSolverMetrics } from "./users/solver-metrics-client";
import { AdminUserManagement } from "./users/users-client";
import { SolverVersion } from "./solver-version";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    await requireWebsiteAdmin(await headers());
  } catch {
    notFound();
  }

  const health = await getHealth();

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
      <header className="grid gap-5 border-b pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            返回排班助手
          </Link>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">RIIC Operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">运行后台</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">在一个页面核对线上构建、观察实时求解状态并管理网站用户。</p>
        </div>
        <nav aria-label="后台板块" className="flex w-full gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1 lg:w-auto">
          {[
            ["01", "求解器版本", "#solver-version"],
            ["02", "实时指标", "#solver-metrics"],
            ["03", "用户管理", "#users"],
          ].map(([number, label, href]) => (
            <a key={href} href={href} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="font-mono text-[10px]" aria-hidden="true">{number}</span>
              {label}
            </a>
          ))}
        </nav>
      </header>

      <SolverVersion
        plannerReady={Boolean(health.ok && health.cliReady)}
        solverFingerprint={health.serve?.fingerprint ?? null}
      />
      <AdminSolverMetrics />
      <AdminUserManagement />
    </main>
  );
}
